window.BENCHMARK_DATA = {
  "lastUpdate": 1747307158076,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "End-to-end Benchmark": [
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
          "id": "49f15471f7965c98694e38caf1e344540dc39342",
          "message": "test: making l2 to l1 test cute (#14250)\n\nRefactored the test to make it nicer. Namely reduced boilerplate by\nhaving better utils (and using them more).",
          "timestamp": "2025-05-14T09:38:37Z",
          "tree_id": "cd6fd599bb884a8504016cfac815f951aaa7517d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/49f15471f7965c98694e38caf1e344540dc39342"
        },
        "date": 1747218034673,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8580,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24561980068935654,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 166683,
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
          "id": "ab471130522cf2b93420f0b01c63ad8c74bcb460",
          "message": "fix: use correct public call ordering on new txe flow (#14198)\n\nFound this little bug when trying to replace the NFT tests with the new\nformat. Have made the modification separately with the rest of the\nporting",
          "timestamp": "2025-05-14T10:13:28Z",
          "tree_id": "5a4336b0b22375b431eba09dd0bd9a8bea7aa277",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ab471130522cf2b93420f0b01c63ad8c74bcb460"
        },
        "date": 1747220126254,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8044,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23027318689800833,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 139219,
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
          "id": "233192ec897742ed6469bba1e2ec724cae32f428",
          "message": "chore: snapshots bucket in tf (#14265)\n\nMoves snapshots bucket into tf",
          "timestamp": "2025-05-14T10:16:43Z",
          "tree_id": "b9cafde153e0aeb705227353edfb4e5fd40be51f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/233192ec897742ed6469bba1e2ec724cae32f428"
        },
        "date": 1747221968338,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8237,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23581440745852672,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 139906,
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
          "id": "a41eda21b61c396858b8821cb2082f56c73b2a3a",
          "message": "fix: making `EcdsaPublicKeyNote` struct fields public (#14296)\n\nFixes #14153",
          "timestamp": "2025-05-14T10:31:01Z",
          "tree_id": "8579fba0ede778d9fd4b5508de6a0788417bf67a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a41eda21b61c396858b8821cb2082f56c73b2a3a"
        },
        "date": 1747222034011,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8632,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24711340652008723,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 154361,
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
          "id": "7155b6be42e27be3c6aeba20ded452574f82c808",
          "message": "fix: Mark txs as non-evictable upon receipt of a block proposal (#14266)\n\nThis PR simply marks txs as non-evictable upon receipt of a block\nproposal. We do this to ensure that validators in particular do not\nevict transactions before needing them for re-execution.",
          "timestamp": "2025-05-14T10:47:52Z",
          "tree_id": "add389451440ab572b2c30560a05ff5e153eac35",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7155b6be42e27be3c6aeba20ded452574f82c808"
        },
        "date": 1747222116664,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8179,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23414910099623418,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 133476,
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
          "id": "97489105440080fac6829d03e772121ca7441596",
          "message": "feat: Optionally publish txs in block proposals (#14276)\n\nThis PR provides and environment variable that determines if proposers\npublish txs along with block proposals.",
          "timestamp": "2025-05-14T10:49:17Z",
          "tree_id": "fadbb97c0d482f2d07499f0e053c4d14fd3ca667",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/97489105440080fac6829d03e772121ca7441596"
        },
        "date": 1747223693016,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8249,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23616927763611556,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 149855,
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
          "id": "a528ef5a48d0616eb1d4c16d9f63cffe47219758",
          "message": "chore: Fix another flake in validator sentinel e2e (#14298)\n\nSample failed run [here](http://ci.aztec-labs.com/1908d2e1e79be275):\n\n```\n09:51:15  FAIL  src/e2e_p2p/validators_sentinel.test.ts\n09:51:15   ● e2e_p2p_validators_sentinel › with an offline validator › collects stats on offline validator\n09:51:15\n09:51:15     ContractFunctionExecutionError: Transaction creation failed.\n09:51:15\n09:51:15     URL: http://127.0.0.1:8545\n09:51:15     Request body: {\"method\":\"eth_sendRawTransaction\",\"params\":[\"0x02f90333827a69198455d4a8008465589b3d830cc89994322813fd9a801c5507c9de605d63cea4f2ce6c4480b902c42335d47e00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000005000000000000000000000000a1153393636750230f4db253300e59ca8bd3a9c0000000000000000000000000ad6855add35f78bc594102e0ac781527cdeb9c52000000000000000000000000a1153393636750230f4db253300e59ca8bd3a9c00000000000000000000000000000000000000000000000056bc75e2d63100000000000000000000000000000c223b10ef31d74b74ac4931da23c76dfd154e43f0000000000000000000000006c7810a6a724f0a3c5882e7149b90d23e8bf6e63000000000000000000000000c223b10ef31d74b74ac4931da23c76dfd154e43f0000000000000000000000000000000000000000000000056bc75e2d631000000000000000000000000000004af126598417209bfa57bab856963c42c2fee5db000000000000000000000000c6edfc31693e921df3c826b102a999db5cc1ca960000000000000000000000004af126598417209bfa57bab856963c42c2fee5db0000000000000000000000000000000000000000000000056bc75e2d63100000000000000000000000000000037bbe29c2766243a070a4b3cbf38917670973080000000000000000000000007d2cd31b604b34e289e02538d468948ec515b10c000000000000000000000000037bbe29c2766243a070a4b3cbf38917670973080000000000000000000000000000000000000000000000056bc75e2d6310000000000000000000000000000061b13c781397bdb68284f02961e16602b9ce8923000000000000000000000000b50043ea007490e0a0250aff54831d8443d1393f00000000000000000000000061b13c781397bdb68284f02961e16602b9ce89230000000000000000000000000000000000000000000000056bc75e2d63100000c001a008e84c0ff4a6160f63addfeb56108f608cd3912e605684616a151be96b5916f5a0100fcf130916031fcfe3aaef969ca8beac5781bbc1b37a29c4b33f36871f8570\"]}\n09:51:15\n09:51:15     Request Arguments:\n09:51:15       from:  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\n09:51:15       to:    0x322813fd9a801c5507c9de605d63cea4f2ce6c44\n09:51:15       data:  0x2335d47e00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000005000000000000000000000000a1153393636750230f4db253300e59ca8bd3a9c0000000000000000000000000ad6855add35f78bc594102e0ac781527cdeb9c52000000000000000000000000a1153393636750230f4db253300e59ca8bd3a9c00000000000000000000000000000000000000000000000056bc75e2d63100000000000000000000000000000c223b10ef31d74b74ac4931da23c76dfd154e43f0000000000000000000000006c7810a6a724f0a3c5882e7149b90d23e8bf6e63000000000000000000000000c223b10ef31d74b74ac4931da23c76dfd154e43f0000000000000000000000000000000000000000000000056bc75e2d631000000000000000000000000000004af126598417209bfa57bab856963c42c2fee5db000000000000000000000000c6edfc31693e921df3c826b102a999db5cc1ca960000000000000000000000004af126598417209bfa57bab856963c42c2fee5db0000000000000000000000000000000000000000000000056bc75e2d63100000000000000000000000000000037bbe29c2766243a070a4b3cbf38917670973080000000000000000000000007d2cd31b604b34e289e02538d468948ec515b10c000000000000000000000000037bbe29c2766243a070a4b3cbf38917670973080000000000000000000000000000000000000000000000056bc75e2d6310000000000000000000000000000061b13c781397bdb68284f02961e16602b9ce8923000000000000000000000000b50043ea007490e0a0250aff54831d8443d1393f00000000000000000000000061b13c781397bdb68284f02961e16602b9ce89230000000000000000000000000000000000000000000000056bc75e2d63100000\n09:51:15\n09:51:15     Contract Call:\n09:51:15       address:   0x322813fd9a801c5507c9de605d63cea4f2ce6c44\n09:51:15       function:  addValidators((address attester, address proposer, address withdrawer, uint256 amount)[])\n09:51:15       args:                   ([{\"attester\":\"0xa1153393636750230f4dB253300E59Ca8bD3a9c0\",\"proposer\":\"0xad6855aDD35F78bc594102E0aC781527cDEb9c52\",\"withdrawer\":\"0xa1153393636750230f4dB253300E59Ca8bD3a9c0\",\"amount\":\"100000000000000000000\"},{\"attester\":\"0xC223B10ef31d74B74ac4931da23c76dfD154e43F\",\"proposer\":\"0x6C7810A6A724f0A3c5882e7149b90D23E8bF6e63\",\"withdrawer\":\"0xC223B10ef31d74B74ac4931da23c76dfD154e43F\",\"amount\":\"100000000000000000000\"},{\"attester\":\"0x4aF126598417209bFa57bab856963c42C2fee5Db\",\"proposer\":\"0xC6edFc31693E921DF3C826B102a999DB5cC1cA96\",\"withdrawer\":\"0x4aF126598417209bFa57bab856963c42C2fee5Db\",\"amount\":\"100000000000000000000\"},{\"attester\":\"0x037BBe29C2766243A070a4b3cbf3891767097308\",\"proposer\":\"0x7D2Cd31b604B34e289E02538D468948eC515b10C\",\"withdrawer\":\"0x037BBe29C2766243A070a4b3cbf3891767097308\",\"amount\":\"100000000000000000000\"},{\"attester\":\"0x61B13C781397Bdb68284F02961e16602B9ce8923\",\"proposer\":\"0xB50043ea007490e0a0250afF54831D8443D1393f\",\"withdrawer\":\"0x61B13C781397Bdb68284F02961e16602B9ce8923\",\"amount\":\"100000000000000000000\"}])\n09:51:15       sender:    0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\n09:51:15\n09:51:15     Docs: https://viem.sh/docs/contract/writeContract\n09:51:15     Details: replacement transaction underpriced\n09:51:15     Version: viem@2.23.7\n09:51:15\n09:51:15       234 |\n09:51:15       235 |         await deployL1ContractsValues.l1Client.waitForTransactionReceipt({\n09:51:15     > 236 |           hash: await multiAdder.write.addValidators([this.validators]),\n09:51:15           |                 ^\n09:51:15       237 |         });\n09:51:15       238 |\n09:51:15       239 |         const slotsInEpoch = await rollup.read.getEpochDuration();\n09:51:15\n09:51:15       at getContractError (../../node_modules/viem/utils/errors/getContractError.ts:78:10)\n09:51:15       at writeContract (../../node_modules/viem/actions/wallet/writeContract.ts:208:11)\n09:51:15       at e2e_p2p/p2p_network.ts:236:17\n09:51:15       at MockSnapshotManager.snapshot (fixtures/snapshot_manager.ts:132:26)\n09:51:15       at P2PNetworkTest.applyBaseSnapshots (e2e_p2p/p2p_network.ts:195:5)\n09:51:15       at Object.<anonymous> (e2e_p2p/validators_sentinel.test.ts:43:5)\n09:51:15\n09:51:15     Cause:\n09:51:15     TransactionExecutionError: Transaction creation failed.\n```",
          "timestamp": "2025-05-14T11:52:23Z",
          "tree_id": "ae6413c8b32112ed146a950a65be58d2ab49456f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a528ef5a48d0616eb1d4c16d9f63cffe47219758"
        },
        "date": 1747225984624,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8199,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23472161781405634,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 139734,
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
          "id": "7f7e9911cb4a2f53965ebac59ac75ce85b29375c",
          "message": "chore: Bump Noir reference (#14306)\n\nAutomated pull of nightly from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nfix: pass Field to ToBits intrinsic in remove_bit_shifts optimization\n(https://github.com/noir-lang/noir/pull/8493)\nfix: don't produce `index Field` in value merger\n(https://github.com/noir-lang/noir/pull/8492)\nfix: allowing accessing associated constants via `Self::...`\n(https://github.com/noir-lang/noir/pull/8403)\nfix: remove unused generic in static_assert\n(https://github.com/noir-lang/noir/pull/8488)\nfix: disallow generics on entry points\n(https://github.com/noir-lang/noir/pull/8490)\nchore(test): Replicate comptime stack overflow in a test\n(https://github.com/noir-lang/noir/pull/8473)\nfeat: `#[test(only_fail_with = \"...\")]`\n(https://github.com/noir-lang/noir/pull/8460)\nfix: variable used in fmtstr inside lambda wasn't tracked as captured\n(https://github.com/noir-lang/noir/pull/8487)\nchore(test): Add more tests for defunctionalization\n(https://github.com/noir-lang/noir/pull/8481)\nEND_COMMIT_OVERRIDE\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-14T12:54:42Z",
          "tree_id": "cc7445085b24cd798def25211f4f3cb834934257",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7f7e9911cb4a2f53965ebac59ac75ce85b29375c"
        },
        "date": 1747230037846,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8265,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23661901711772956,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 131419,
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
          "id": "535a1edd3b81c390ad6e66a7c8e8f35575e2e077",
          "message": "chore: txe call private generic fix (#14309)\n\nQuick fix in `env.call_private()` generics",
          "timestamp": "2025-05-14T15:31:18Z",
          "tree_id": "7d79f5b33c89937a372caa6509f480f5eee45440",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/535a1edd3b81c390ad6e66a7c8e8f35575e2e077"
        },
        "date": 1747238797363,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8102,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23193455920025252,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 131104,
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
          "id": "862545b50c0e6f63342b9a840fc63a95bf2e3782",
          "message": "test: hack to see if gas estimation flake goes away (#14317)\n\nWe have a hypothesis that the `gas_estimation.test.ts` is flaky because\nthe base fee drops after the fee estimation is performed and when the tx\nis mined which results in the equality check between the estimation and\nreal tx fee to fail.\n\nThis could happen if PXE is too slow to sync.",
          "timestamp": "2025-05-14T17:05:40Z",
          "tree_id": "8e94c949f25f05d23e33656c8594b4ec11615245",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/862545b50c0e6f63342b9a840fc63a95bf2e3782"
        },
        "date": 1747244857947,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8290,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23733514404225894,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 151960,
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
          "id": "ed780d06d669ede490c8d8002979c082fd6b3632",
          "message": "chore(avm): verify as well on prove command (#14315)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-05-14T17:11:21Z",
          "tree_id": "98ec754454c6260ff7f436c3bad7cf77295bba85",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ed780d06d669ede490c8d8002979c082fd6b3632"
        },
        "date": 1747246689026,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8709,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24931283150815564,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 355452,
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
          "id": "845d2851f487294a67a82a5f34549ffde44cfb0a",
          "message": "chore: txe `callresult` value not optional (#14236)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-05-14T17:56:07Z",
          "tree_id": "9a2ff8310cd22ef343253b831d73c726634a317f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/845d2851f487294a67a82a5f34549ffde44cfb0a"
        },
        "date": 1747248084802,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8316,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23808225694360952,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 154801,
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
          "id": "a0a29dc37566ef91411a5d5349a7a1cf4d692c4e",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"625815034d\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"625815034d\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-05-15T02:32:16Z",
          "tree_id": "3d83d1a996bf8e642c16e1019c83d7cdb2f4ce6c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a0a29dc37566ef91411a5d5349a7a1cf4d692c4e"
        },
        "date": 1747278387876,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8138,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23297853032949456,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 137283,
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
          "id": "1e4ae08b9c3d8eefda7695a01d67d29e93e0ad29",
          "message": "fix: make `msgpackr` a full dependency of `bb.js` (#14322)\n\nThis PR fixes the issue in bb.js dependencies which is causing failures\nin https://github.com/noir-lang/noir/pull/8506\n\nThis was broken in\nhttps://github.com/AztecProtocol/aztec-packages/pull/13590 where the\nexisting msgpack dependency was removed.\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-15T10:00:37Z",
          "tree_id": "e899dc0a245ae821389cdb9a855a5796e5fe3769",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1e4ae08b9c3d8eefda7695a01d67d29e93e0ad29"
        },
        "date": 1747305726298,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9030,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2585273300874365,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 145211,
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
          "id": "dd4e9ab702d02be7f122dd4a227b4568c2bdb0b6",
          "message": "feat: add auto updater (#14292)\n\nFix #14238\n\n---------\n\nCo-authored-by: Santiago Palladino <santiago@aztecprotocol.com>",
          "timestamp": "2025-05-15T09:58:10Z",
          "tree_id": "cd6a958486716c9b4bc0d012489c25ac5fb438bc",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/dd4e9ab702d02be7f122dd4a227b4568c2bdb0b6"
        },
        "date": 1747305726928,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8170,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23389383652317747,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 136556,
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
          "id": "e5122c06e41a475edf0818dcf6cbd5dafcee9b9a",
          "message": "feat: store deployment block number for contracts (#14325)",
          "timestamp": "2025-05-15T10:26:05Z",
          "tree_id": "e1f0319576b13413cbe8ec4c90fa16a7d1e2cdef",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e5122c06e41a475edf0818dcf6cbd5dafcee9b9a"
        },
        "date": 1747307156974,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8246,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23608124027640393,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 141974,
            "unit": "us"
          }
        ]
      }
    ]
  }
}