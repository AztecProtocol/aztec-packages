window.BENCHMARK_DATA = {
  "lastUpdate": 1745598513935,
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
          "distinct": false,
          "id": "5d3e24c6652a2788cc78202028f2c642b36b498f",
          "message": "fix: dependency cycles in public simulator part 2 (serializable bytecode) (#13680)\n\nDown to 1 cycle now: `private_execution.ts ->\nprivate_execution_oracle.ts`\n\nCo-authored-by: dbanks12 <david@aztecprotocol.com>",
          "timestamp": "2025-04-20T16:35:35Z",
          "tree_id": "3952fd18b522bd2322b9e4013618b9b78744b0bf",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5d3e24c6652a2788cc78202028f2c642b36b498f"
        },
        "date": 1745170054552,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9732,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26149540330305304,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 154784,
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
          "id": "50f5bf07e6981a86b08b0b14b94940105fe15971",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"d0d78918dc\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"d0d78918dc\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-21T02:32:14Z",
          "tree_id": "826494a0298a2d3b9aaaf021caeb950da310423a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/50f5bf07e6981a86b08b0b14b94940105fe15971"
        },
        "date": 1745204749513,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9678,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2600377834899411,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 153411,
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
          "id": "68e4b6f03a11e74b088938c02d3154e37720915d",
          "message": "chore: use PublicComponentKeys (#13686)\n\nReplaces `contains_ipa_claim` and `ipa_claim_public_input_indices` with\n`ipa_claim_public_input_key` (a `PublicComponentKey`). This reduces the\nrollup flavor UH VK size in fields from 139 to 129.\n\nNote: Huge diff is due to regeneration of some Prover.toml files in\n`noir-protocol-circuits/crates`",
          "timestamp": "2025-04-21T19:57:13Z",
          "tree_id": "98ab3e2d9ff5c0b4b559e9f187cd06245e890782",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/68e4b6f03a11e74b088938c02d3154e37720915d"
        },
        "date": 1745270349340,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9684,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26020863528377053,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 153709,
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
          "id": "3976e8e325d4b11f0003dc04e2abef09f619a417",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"7306f2ac7a\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"7306f2ac7a\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-22T02:30:31Z",
          "tree_id": "38907777de3d048e082ae7c5925a2165efea60c3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3976e8e325d4b11f0003dc04e2abef09f619a417"
        },
        "date": 1745291108082,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9639,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2589942889169351,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 160202,
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
          "id": "366d98084f5de17c73924b7080e7263d86dc1f05",
          "message": "chore: Bump Noir reference (#13592)\n\nAutomated pull of nightly from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nfix(brillig): SliceRefCount reads from the appropriate pointer\n(https://github.com/noir-lang/noir/pull/8148)\nchore: remove try_merge_only_changed_indices\n(https://github.com/noir-lang/noir/pull/8142)\nchore(ssa): Test terminator value constant folding and resolve cache for\ndata bus (https://github.com/noir-lang/noir/pull/8132)\nchore: parse nop in SSA parser\n(https://github.com/noir-lang/noir/pull/8141)\nfix(ssa): Do not inline simple recursive functions\n(https://github.com/noir-lang/noir/pull/8127)\nfix: wrapping mul support for u128\n(https://github.com/noir-lang/noir/pull/7941)\nchore: update ACVM doc (https://github.com/noir-lang/noir/pull/8004)\nfix(ssa): Loop range with u1\n(https://github.com/noir-lang/noir/pull/8131)\nfix(acir): Check whether opcodes were laid down for non-equality check\nbefore fetching payload locations\n(https://github.com/noir-lang/noir/pull/8133)\nchore: add a benchmark for opcodes which need a batchable inversion\n(https://github.com/noir-lang/noir/pull/8110)\nchore: create module for array handling in acirgen\n(https://github.com/noir-lang/noir/pull/8119)\nfeat: avoid unnecessary zero check in brillig overflow check\n(https://github.com/noir-lang/noir/pull/8109)\nchore(optimization): Enable experimental ownership clone scheme by\ndefault (https://github.com/noir-lang/noir/pull/8097)\nchore(experimental): Function::simple_optimization for SSA optimizations\n(https://github.com/noir-lang/noir/pull/8102)\nfeat: replace field divisions by constants with multiplication by inv…\n(https://github.com/noir-lang/noir/pull/8053)\nfix(ssa): fix possibility to `Field % Field` operaions in Brillig from\nSSA (https://github.com/noir-lang/noir/pull/8105)\nfix(parser): error on missing let semicolon in trait (and others)\n(https://github.com/noir-lang/noir/pull/8101)\nchore: simpler `make_mutable` in `array_set` optimization\n(https://github.com/noir-lang/noir/pull/8106)\nchore(docs): update bb commands to match 0.84.0\n(https://github.com/noir-lang/noir/pull/8050)\nchore: don't use `set_value_from_id` in `constant_folding`\n(https://github.com/noir-lang/noir/pull/8091)\nfix: add proper handling for `u128` in comptime interpreter\n(https://github.com/noir-lang/noir/pull/8079)\nfeat: Port callstack resolution from aztec to noirjs\n(https://github.com/noir-lang/noir/pull/7642)\nfix(ssa): Do not unroll loop with break\n(https://github.com/noir-lang/noir/pull/8090)\nfeat: `#[allow(dead_code)]`\n(https://github.com/noir-lang/noir/pull/8066)\nchore: don't use `set_value_from_id` in `loop_invariant`\n(https://github.com/noir-lang/noir/pull/8085)\nfeat(experimental): Implement separate `-Zownership` analysis for\nownership pass (https://github.com/noir-lang/noir/pull/7861)\nchore(docs): Add architecture docs\n(https://github.com/noir-lang/noir/pull/7992)\nchore: don't use `set_value_from_id` in `simplify_cfg`\n(https://github.com/noir-lang/noir/pull/8072)\nchore: don't use `set_from_value_id` in `remove_if_else`\n(https://github.com/noir-lang/noir/pull/8070)\nchore: don't use `set_value_from_id` in `remove_bit_shifts`\n(https://github.com/noir-lang/noir/pull/8071)\nfix: replace values in data_bus too\n(https://github.com/noir-lang/noir/pull/8086)\nchore: bump bignum timeout (https://github.com/noir-lang/noir/pull/8080)\nchore: Accept optional test path for emitting integration tests\n(https://github.com/noir-lang/noir/pull/8062)\nfeat: ssa fuzzer (https://github.com/noir-lang/noir/pull/7641)\nfix: Allow more slack in AST calibration for CI\n(https://github.com/noir-lang/noir/pull/8076)\nchore: Print `unsafe { ... }` around calls to Brillig from ACIR in AST\n(https://github.com/noir-lang/noir/pull/8077)\nfix: SSA pass print filter to include the count\n(https://github.com/noir-lang/noir/pull/8074)\nEND_COMMIT_OVERRIDE\n\n---------\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2025-04-22T09:43:59Z",
          "tree_id": "3608dc0155a4e42394374941a5618ec315826855",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/366d98084f5de17c73924b7080e7263d86dc1f05"
        },
        "date": 1745318701430,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9361,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2680020314553984,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 147278,
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
          "id": "593f810e642841e139a82c55c16bde1f9bddc390",
          "message": "fix: pass along coinbase (#13560)\n\nLet's see if this passes tests\n\nFix #13643\n\nCo-authored-by: Lasse Herskind <16536249+LHerskind@users.noreply.github.com>",
          "timestamp": "2025-04-22T10:11:16Z",
          "tree_id": "c740357d57b394fe7e9566370b4a9bd64dbea2a3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/593f810e642841e139a82c55c16bde1f9bddc390"
        },
        "date": 1745319983171,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9673,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.27693635282577544,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 158391,
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
          "id": "0e51259cc55b4c84eb6c6b21fdac7b6478dcf2c4",
          "message": "fix: run yarn (#13713)\n\nFix bootstrap after\nhttps://github.com/AztecProtocol/aztec-packages/commit/366d98084f5de17c73924b7080e7263d86dc1f05",
          "timestamp": "2025-04-22T11:51:43Z",
          "tree_id": "23ec1e4286943a567b011c41b7607226931b8f5c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0e51259cc55b4c84eb6c6b21fdac7b6478dcf2c4"
        },
        "date": 1745326126179,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9156,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26213913926089344,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 145623,
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
          "id": "c244b2e6f20e7390d5bbd788f6a982474e6476fe",
          "message": "fix: Increase timeout for p2p integration test (#13720)\n\nThis PR simply increases the timeout for a test",
          "timestamp": "2025-04-22T13:05:32Z",
          "tree_id": "5d60c0acd0e953a880757da5c21963d8c3282efd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c244b2e6f20e7390d5bbd788f6a982474e6476fe"
        },
        "date": 1745330522083,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9245,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26468393694064013,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 153289,
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
          "id": "6af5943edd60ee69d1366ba23f0d6f700346d6f5",
          "message": "chore: remove omit param from serialize derivation (#13703)\n\nWhile working on\nhttps://github.com/AztecProtocol/aztec-packages/issues/13684 I noticed\nwe no longer use this param at all, so I simply got rid of it. The\ncurrent partial note approach (the feature that used to use `omit`) also\ndoes not rely on it.",
          "timestamp": "2025-04-22T13:20:55Z",
          "tree_id": "7f0fcdf13ca080310674ba786a41a2f22ec0c9c3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6af5943edd60ee69d1366ba23f0d6f700346d6f5"
        },
        "date": 1745332881481,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9137,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2615974658530288,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 143538,
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
          "id": "49ac1db0dae6160d65e8ed8e8480fb4658284e3a",
          "message": "chore: remove old terraform configs (#13716)\n\nFixes #13651",
          "timestamp": "2025-04-22T14:08:54Z",
          "tree_id": "0186411c2b94c1ae610ee2cc17a0bfcbb907dd3a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/49ac1db0dae6160d65e8ed8e8480fb4658284e3a"
        },
        "date": 1745334160399,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9799,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.28052544660352413,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 170433,
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
          "id": "f19c182e80be6e3c7239a48585ab70bc8cffd5ea",
          "message": "refactor: validate block header hash in circuits (#13094)\n\nPreviously: we computed the \"end\" block (header) hash in circuit and\noutput it along with the previous block hash from block root. The L1 was\nsupposed to check that the previous block hash was the same as the\nprevious block's end block hash. But we only did that for the first\nblock of the entire epoch, the rest of the proposed block hashes could\nbe anything.\n\nNow:\n- Remove block hashes on l1, as it is committed to by archive roots. And\nnothing is looking up the block hash value on L1.\n- Constrain the previous block hash in block root rollup circuit by\nperforming a membership check against the previous archive root.",
          "timestamp": "2025-04-22T14:10:36Z",
          "tree_id": "eda00eb219a857f45887855751deda090c0a5d06",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f19c182e80be6e3c7239a48585ab70bc8cffd5ea"
        },
        "date": 1745334592036,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9595,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.27468603386329427,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 156456,
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
          "id": "35dec904bac05e891255d3e79dc43619a2b562d1",
          "message": "chore: address some visibility warnings (#13728)\n\nPulls out some changes from #13685",
          "timestamp": "2025-04-22T15:11:51Z",
          "tree_id": "0c50ef59770ecba2844119f71ac2b2e8bc283203",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/35dec904bac05e891255d3e79dc43619a2b562d1"
        },
        "date": 1745341668576,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9650,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.27626965244172647,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 169172,
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
          "id": "e459b2acba8438a0e631a7e067eec36265efc468",
          "message": "chore: Sanity check block number from archiver before returning it (#13631)\n\nWe have seen an archiver that stored blocks under the wrong block\nnumber, which caused errors in other components. This adds a sanity\ncheck before returning them.",
          "timestamp": "2025-04-22T15:24:07Z",
          "tree_id": "e844f39884efd0dff90700545c96bdfb36f523cd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e459b2acba8438a0e631a7e067eec36265efc468"
        },
        "date": 1745343536845,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9438,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.270198631119695,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 159089,
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
          "id": "def1287f42c5b4406ceb2b76d00e078b649f50e5",
          "message": "test: mempool limit (#13735)\n\nThis PR adds and e2e test to verify the mempool limit works as expected",
          "timestamp": "2025-04-22T16:46:32Z",
          "tree_id": "2e0fb9e54736bdfb1af0f932ec721cb0c6a86f9d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/def1287f42c5b4406ceb2b76d00e078b649f50e5"
        },
        "date": 1745345251649,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9156,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26214071975977427,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 145645,
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
          "id": "5c8a9939740367f203ed06761aaf826b8492d7c8",
          "message": "feat(avm): fast entity indexing without macros (#13737)\n\nPossibly the final iteration of the work started in\nhttps://github.com/AztecProtocol/aztec-packages/pull/11605 .\n\nThe macro was blowing up when adding more columns. Instead, I found a\nway to precompute an array that lets us efficiently access entities via\nthe column enum.\n\nBEFORE\n\n```\nCompile time: 2m 20s\nMemory (compilation): 5GB\n```\n\nAFTER\n\n```\nCompile time: 1m 50s\nMemory (compilation): 2.6GB\n```\n\nRuntime is unaffected.",
          "timestamp": "2025-04-22T17:14:42Z",
          "tree_id": "96857bf9b5edea1f65641527ef97332c587cee3b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5c8a9939740367f203ed06761aaf826b8492d7c8"
        },
        "date": 1745346972083,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9286,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2658508943357011,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 155906,
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
          "id": "c55088e83ca8d732d3151e5c757586b0f411a9fc",
          "message": "chore: Disable blobscan by default (#13742)\n\nDisables blobscan as blob archive fallback since its API has not been\nreliable enough. We keep it enabled in k8s config for our blobsink\nthough.",
          "timestamp": "2025-04-22T17:29:54Z",
          "tree_id": "5b90d6dcb2cbf22b0256b4cbb83f56e51bad5b83",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c55088e83ca8d732d3151e5c757586b0f411a9fc"
        },
        "date": 1745347248050,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9167,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26243034114632197,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 146858,
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
          "id": "9c1d9f1c49140639384a17b9eae5f87701d294f0",
          "message": "fix(p2p): better batch connection sampling (#13674)\n\n## Overview\n\nImproves batch connection sampling such that we can increase the retry\nattempts for prover nodes requesting\ntransaction information from their peers.\n\n### Core improvements\n**Previously**\nWhen making a batch request, we requested the peer list, iterated\nthrough it until we found a peer without an reqresp active connection\nand used those. This meant that we were commonly only using the first\n3-4 peers in the peer list.\n\nNow it will do random sampling without replacement to peers without\nalready active reqresp connections. If there are non available, then we\nwill just sample from peers already servicing requests.",
          "timestamp": "2025-04-22T18:16:00Z",
          "tree_id": "b3f7ffbb5cfae21a78eba4cdbe943aa7cf2d09a8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9c1d9f1c49140639384a17b9eae5f87701d294f0"
        },
        "date": 1745349033587,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9234,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2643534680795831,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 143692,
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
          "id": "2b6c627ead411e248d28f77667556c2e9312114a",
          "message": "chore: starknet feature flag (#13681)\n\nAsked by Kesha to keep utmost separation going into audit / not impact\nnormal dev in this critical juncture",
          "timestamp": "2025-04-22T18:19:10Z",
          "tree_id": "b8aa82ef50f1615de9f395963c243b7c4699a94d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2b6c627ead411e248d28f77667556c2e9312114a"
        },
        "date": 1745350995284,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9334,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26722313211698706,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 149176,
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
          "id": "0e604a14889cb939102cf4126d70197be4387e8e",
          "message": "refactor: bb.js non-inlined web workers (#13736)\n\nInlined web workers are completely unsupported in browser extensions,\nwhich created problems for external teams. This PR moves to a more\nmodern approach, leveraging the integrated support in latest versions of\n`webpack` for web workers.\n\nUnfortunately, I've run into quite a few problems implementing this\napproach:\n\n* Webpack didn't support proper module workers up until recently,\nforcing me to update it (so it wouldn't transpile the imports to the\nunsupported `importScripts`). Took the opportunity to equalize versions\naccross the board.\n* There's a bug in webpack that forbids loading them asynchronously and\nthrew me for a while: https://github.com/webpack/webpack/issues/17014.\nSolution is to carefully handle our dynamic imports so they're only\napplied to the wasm files.\n* We were using `worker-loader` in `webpack` 5, which is explicitly\ndeprecated, but we needed it for the inlining. This gets rid of it.\n* Unfortunately again, new webpack handles `.d.ts` and `.d.ts.map` files\ndifferently now, which was causing trouble for downstream apps that also\nused webpack. Test apps and boxes have been updated to ignore them at\nbuild time (since they're only needed during development). Vite has no\nissues.\n* Took the opportunity to clean up our API, since we were never\ninitializing the `SyncApi`with a worker and conversely, the `Async` API\nwith a plain wasm module.",
          "timestamp": "2025-04-22T21:28:05Z",
          "tree_id": "4e2e4c1224801b111a5dbde8469299e168908b8a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0e604a14889cb939102cf4126d70197be4387e8e"
        },
        "date": 1745361987622,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9420,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2696717447654018,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 156526,
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
          "id": "a00566c9e12c1afc053f6a56619a39de42bf0b02",
          "message": "chore: remove circuit simulator (#13689)\n\nRemove all code related to the `CircuitSimulator`.\n\nThe idea of the `CircuitSimulator` was to allow us to write our\nverification algorithms once and for all in \"circuit\" format then\nachieve recursive verification through supplying a real builder (e.g.\nUltra/Mega) and native verification through supplying the\n`CircuitSimulator`. The motivation was that the recursive circuits\nshould be the first class objects, rather than their native\ncounterparts. In practice this proved to be too complicated and was\nnever used. We don't have time to flesh it out at this point and it adds\na very high degree of complexity and clutter to some of our most complex\ncode.",
          "timestamp": "2025-04-22T22:32:11Z",
          "tree_id": "7a4c9905e0ee8ecd06d0323f3316c041ecdf4284",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a00566c9e12c1afc053f6a56619a39de42bf0b02"
        },
        "date": 1745366809589,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9292,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2660263589557508,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 153623,
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
          "id": "30a5ea04be3159d0003a44d539a5e3c5ddf6fd5c",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"570281a28b\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"570281a28b\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-23T02:30:45Z",
          "tree_id": "df994f31f7735b48324ae4db732acb1e83f450b2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/30a5ea04be3159d0003a44d539a5e3c5ddf6fd5c"
        },
        "date": 1745377344641,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9140,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26166358906675324,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 151344,
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
          "id": "7e7eb85a8e0f67821debfdd18bb4dedd5113d359",
          "message": "feat!: remove slice read from CALL (#13729)\n\nChanges the opcode operands of CALL:\n### Old\n`INDIRECT_8, gasOffset, addrOffset, argsOffset, argsSizeOffset`\n\n### New\n`INDIRECT_16, l2GasOffset, daGasOffset, addrOffset, argsOffset,\nargsSizeOffset`",
          "timestamp": "2025-04-23T06:55:16Z",
          "tree_id": "0d47f3f3cb3e584e1bd0a99f45d3e6d543919b52",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7e7eb85a8e0f67821debfdd18bb4dedd5113d359"
        },
        "date": 1745395862173,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9224,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2640806481172898,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 149377,
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
          "id": "5d93a0eb0f97a85c61a77732402d47bd89d30513",
          "message": "chore(contracts): core/staking -> core/slashing (#13748)\n\nupon suggestion from amin",
          "timestamp": "2025-04-23T08:34:01Z",
          "tree_id": "96db5660775e8c07620cc02d485f26ae7c83269c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5d93a0eb0f97a85c61a77732402d47bd89d30513"
        },
        "date": 1745400514575,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9038,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.25873656348683743,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 145854,
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
          "id": "ec468d91dae8d8d3f9555641c42de56eb6c8f53a",
          "message": "refactor(avm): less codegen for lookups (#13741)\n\nCreate some reasonable base class to avoid lots of codegen.",
          "timestamp": "2025-04-23T08:56:00Z",
          "tree_id": "b63c3e9379789cf7f48fbd5e62cc48ff8625a644",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ec468d91dae8d8d3f9555641c42de56eb6c8f53a"
        },
        "date": 1745403498762,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8941,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2559672361937672,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 137880,
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
          "id": "1c20920d0693ea392af5bdb60cad09aa512060d4",
          "message": "chore: bump axois (#13453)\n\n## Overview\n\nbump axios\n\n---------\n\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2025-04-23T09:52:06Z",
          "tree_id": "470d8aab21ad52eb593cdb6628ccf1b04414c0d2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1c20920d0693ea392af5bdb60cad09aa512060d4"
        },
        "date": 1745406457104,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9164,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26235322976502334,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 139151,
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
          "id": "45cd39b2d374d986980ba824e53422f47368708c",
          "message": "feat: Tighter timing on ACVM (#13743)\n\nThis PR alters the metrics capture for acvm execution to more tightly\ntarget the acvm.",
          "timestamp": "2025-04-23T11:27:25Z",
          "tree_id": "2af398de5c0b4a8906721ae0267cb430ebd2ba4a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/45cd39b2d374d986980ba824e53422f47368708c"
        },
        "date": 1745411111879,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9054,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.25921341688645805,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 139359,
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
          "distinct": false,
          "id": "7fb333a726dc3927ea4efcd73f2ab585122f746f",
          "message": "chore: Update docs snippet (#13739)\n\nMoving simple docs snippet from simple test example (so it can be\ndeleted).",
          "timestamp": "2025-04-23T13:06:22Z",
          "tree_id": "e189a946bc521b8c3cbe0a41b8f4920401af4ab9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7fb333a726dc3927ea4efcd73f2ab585122f746f"
        },
        "date": 1745417264526,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9415,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2695414157123777,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 139979,
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
          "id": "0dd8a7e3a5a49090eec5bdb054c74fc7afc572eb",
          "message": "feat: report world state size on disk (#13706)\n\nCloses https://github.com/AztecProtocol/aztec-packages/issues/13200\n\nAdds reporting for tracking the disk space currently used by the current\nworld state.",
          "timestamp": "2025-04-23T14:24:19Z",
          "tree_id": "6712f1cc303d45e7ce174abede097cb7e610eec5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0dd8a7e3a5a49090eec5bdb054c74fc7afc572eb"
        },
        "date": 1745424160712,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9040,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.25880379333895975,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 136300,
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
          "id": "cf637dcd4069456f41e3b078065c3729384b55f4",
          "message": "chore!: use single extended viem client (#13715)\n\nFixes #12254\nEliminates redundancy of passing 2 clients to a lot of classes, and just\npasses one instead that can do both public & wallet actions.\n\n---------\n\nCo-authored-by: Santiago Palladino <santiago@aztecprotocol.com>",
          "timestamp": "2025-04-23T15:27:59Z",
          "tree_id": "9073dd8541002f2e97b0e9882ff12277cc8363fd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cf637dcd4069456f41e3b078065c3729384b55f4"
        },
        "date": 1745425709782,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9373,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2683355708047679,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 148316,
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
          "id": "d4d503a9ac16006a20002ee7ca1f654a9873dbdd",
          "message": "feat: exec opcode spec table (#13594)\n\nThis adds some foundational stuff for the execution instruction\nspecfication table and a basic use-case within the execution loop.\n\n### Trace Changes\n- A precomputed table for the exec instruction specs.\n- Register information in execution trace and supports up to 7 operands\nin addressing.\n\n### Simulation\n- Adds the (temporary) `set_inputs` and `set_output` so that\n`TaggedValue` that are needed in the execution registers can be emitted\nas part of the ExecutionEvent.\n\n### Tracegen\n- Added new tables `SUBTRACE_INFO_MAP` `REGISTER_INFO_MAP`, these\ncontain information used in tracegen when placing values into their\nrespective registers\n- Updated `ExecutionTraceBuilder::process` to properly handle placing\nthe `inputs/outputs` from the execution event into respective registers.\nNOTE: Operands likely need the same treatment but this hasnt been done\nyet.\n\n### Testing\n- There is a new `ExecutionConstrainingTest` that tests the basic\ndecoding and allocation of registers for a simple `ADD`",
          "timestamp": "2025-04-23T15:36:12Z",
          "tree_id": "8e4a53e9092171cfd2952af35c18d33d92ccda20",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d4d503a9ac16006a20002ee7ca1f654a9873dbdd"
        },
        "date": 1745426223795,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9354,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2678010002902963,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 141964,
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
          "id": "65a9f339f894c6c7c0e56a68bf018a8ead6c7b20",
          "message": "fix: no exports of simulator should depend on jest-mock-extended (#13694)\n\nFixes https://github.com/AztecProtocol/aztec-packages/issues/13655\n\nOther components (tests in `bb-prover`, `prover-client`) use\n`SimpleContractDataSource` and `PublicTxSimulationTester`. These are NOT\nmeant to depend on `jest-mock-extended`, but `SimpleContractDataSource`\nimported `avm/fixtures/index.ts` for `getFunctionSelector`. And that\n`index.ts` imported `jest-mock-extended`.\n\nInstead of having a bunch of utilities into `avm/fixtures/index.ts`, I\nmoved them into `initializers.ts` (needs jest) and `utils.ts` (pure\nutils, doesn't need jest). And then `SimpleContractDataSource` imports\n`utils.ts` and has no dependency on `jest-mock-extended`.\n\nOther components that depend on `SimpleContractDataSource` or\n`PublicTxSimulationTester` now explicitly import them from\n`simulator/public/fixtures` since they're no longer in\n`simulator/server`.\n\nRemoved dependency of `ivc-integration/src/witgen.ts` on\n`PublicTxSimulationTester` at the cost of small code-duplication.\n\n---------\n\nCo-authored-by: dbanks12 <david@aztecprotocol.com>",
          "timestamp": "2025-04-23T18:21:33Z",
          "tree_id": "35848bc0855ea62a3bd2ffd88bf869850e86df45",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/65a9f339f894c6c7c0e56a68bf018a8ead6c7b20"
        },
        "date": 1745436019332,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9950,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2848583271352909,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 152928,
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
          "distinct": true,
          "id": "9a3bb461448b1657345a56cbdb493e6330006222",
          "message": "fix: remove insecure dummy round derivation from sumcheck and shplemini (#13488)\n\nRemove all insecure dummy round derivations from Sumcheck and Shplemini.\nAchieved by using `padding_indicator_array` introduced in\nhttps://github.com/AztecProtocol/aztec-packages/pull/13417 that takes\nwitness `log_circuit_size` as an argument, which getting range\nconstrained and constrained to be the log of `circuit_size` by means of\na method `constrain_log_circuit_size` introduced in this PR.\nAs a result, UltraRecursiveVerifier is no longer using unconstrained\nwitnesses related to the padding.\n\nI incorporated some changes into AVM recursive verifier, but it's still\ninsecure due to an mle evaluation for public inputs that requires\n`log_circuit_size`.\n\n---------\n\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>",
          "timestamp": "2025-04-23T21:20:48Z",
          "tree_id": "751131886918533a4cccad6e9e75b9bc8db97e28",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9a3bb461448b1657345a56cbdb493e6330006222"
        },
        "date": 1745448902841,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9131,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26141173315194843,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 148832,
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
          "id": "2de3bc51beeeb59e9e68b4f6ec1f40c6cdcda50d",
          "message": "feat: SMT Verificaiton Module: Data Structures (#13658)\n\nThis pr adds new Symbolic objects: Tuple, Array and Set \n\n# Data Structures\n\n- Added `STuple`, `SymArray`, `SymSet` classes to ease up lookup tables\nand ROM/RAM arrays symbolic translation\n- Reflected new symbolic objects in `UltraCircuit`, `STerm` and `Solver`\n\n- Added tests for all of the new structures\n- Added pretty print for these structures\n\n# Bool\n\nadded tests for symbolic bool class\n\n# Solver\n\n- Added a few more default solver configurations to use. \n- Added `ff_bitsum` option to solver config. It allows solver to\nunderstand bitsums (namely constraints of the form `b0 + 2 * b1 + 4 * b2\n+ ... == X`)\n- Added few more debug solver options\n- Added few options to handle arrays and sets\n- Fixed a bug: `lookup_enabled` was not handled properly",
          "timestamp": "2025-04-23T22:33:22Z",
          "tree_id": "dd58a8ef4b06a0b8894d687f33380fa325dcdc8e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2de3bc51beeeb59e9e68b4f6ec1f40c6cdcda50d"
        },
        "date": 1745452746114,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8996,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2575493509627581,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 136035,
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
          "id": "e4e7fca41d3b07ce3b281028ae9615d787ddb66f",
          "message": "chore: move check_circuit functionality from `TranslatorCircuitBuilder` into a `TranslatorCircuitChecker` (#13761)\n\nIn this PR:\n* move circuit checking functionality in a `TranslatorCircuitChecker`\nclass\n* address remaining occurrences of `circuit_constructor`\n* isolate and reorganise a few anonymous functions as a start of\nimproving the builder's readability\n* a tiny bit of constifying",
          "timestamp": "2025-04-23T22:37:05Z",
          "tree_id": "35650ab7ff7f0071fc3886c70532cbc86b0553f2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e4e7fca41d3b07ce3b281028ae9615d787ddb66f"
        },
        "date": 1745452947889,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9121,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26112728649580236,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 144865,
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
          "id": "467166f47f443412fcd7cd9ee9137896bbbe28b2",
          "message": "chore: use public component key for pairing inputs (#13705)\n\nReplaces `pairing_point_accumulator_public_input_indices` and\n`contains_pairing_point_accumulator` with a `PublicComponentKey`\n`pairing_inputs_public_input_key`. This reduces the number of field\nelements in a honk VK (all variants) by 16. (The old components are\nstill used for Plonk so I couldn't remove them entirely yet).",
          "timestamp": "2025-04-23T23:34:21Z",
          "tree_id": "a2cbaea3c36656eaa4e21d4544f872a36ab90145",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/467166f47f443412fcd7cd9ee9137896bbbe28b2"
        },
        "date": 1745456101483,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9622,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2754609218740488,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 155998,
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
          "id": "0f31e1da06e677b3438910f7caf322d975229674",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"a3cb3569f7\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"a3cb3569f7\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-24T02:31:35Z",
          "tree_id": "e853c991f56aed285449faecc8c4023cf6440daf",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0f31e1da06e677b3438910f7caf322d975229674"
        },
        "date": 1745464105415,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9192,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2631578947368421,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 138360,
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
          "id": "abc462350775ceaf16e3e2af45f1669f02ee5adb",
          "message": "fix: remove all txs from a failed epoch (#13771)\n\nFixes #13723 \nTo be reverted in the future, tracked here:\nhttps://github.com/AztecProtocol/aztec-packages/issues/13770",
          "timestamp": "2025-04-24T09:59:13Z",
          "tree_id": "4d4899c750191faa8cc700a87034c81d7bfde41d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/abc462350775ceaf16e3e2af45f1669f02ee5adb"
        },
        "date": 1745492542199,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9660,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2765606803171487,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 148245,
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
          "id": "640dd086401ef8ed05063fea8939062f69aebb8e",
          "message": "refactor: bespoke export for client native prover / PXE server store lazy load (#13783)\n\nFixes: https://github.com/AztecProtocol/aztec-packages/issues/13656 (or\nmore like avoids the problematic import)\n\nCreates specific (and more descriptive) exports for `bb-prover`,\nfocusing on where the code should run (client/server) rather than the\ntask at hand (prover/verifier). This mimics the behavior of other\npackages with similar issues.\n\nWe still have to figure out publishing of native packages.",
          "timestamp": "2025-04-24T12:06:29Z",
          "tree_id": "abff4369fc949913de8495996c9a30310915387f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/640dd086401ef8ed05063fea8939062f69aebb8e"
        },
        "date": 1745501398068,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10307,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.29507856171627134,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 172250,
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
          "id": "4d04e62b1f48cbdbdc05c6c6fd057bdc4bf834fa",
          "message": "feat!: Use combined p2p and http prover coordination (#13760)\n\nRefactors prover coordination to allow tx retrieval by the prover node\nover p2p and/or http using known nodes.",
          "timestamp": "2025-04-24T12:46:08Z",
          "tree_id": "782fac50c3e254f3991c8ca55b2879bda9b8f48f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4d04e62b1f48cbdbdc05c6c6fd057bdc4bf834fa"
        },
        "date": 1745502312365,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9310,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.266538657034315,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 154603,
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
          "id": "1f9603eefccf7d9bbb12df086b10c949a880e8c3",
          "message": "feat: Store epoch proving job failure (#13752)\n\nAdds a config `PROVER_NODE_FAILED_EPOCH_STORE` pointing to a local\ndirectory or google storage. If set, when an epoch proving job fails, it\nuploads a snapshot of the archiver and world state, along with all txs,\nblocks, and cross-chain messages involved in the epoch, so we can\n(hopefully) reconstruct state at the time of the failure.\n\nRe-running is done via two new actions: one for downloading, another for\nactually proving. Proving is done with a local prover, which should be\ngood enough for debugging smallish epochs, but we can extend this to use\na remote broker if we need more horsepower. See\n`end-to-end/src/e2e_epochs/epochs_upload_failed_proof.test.ts` for an\nend-to-end on how to use these actions (with real proofs disabled).\n\nPending add the env var to the prover node in k8s, and cherry-pick to\nthe alpha-testnet branch once merged.\n\nFixes #13725",
          "timestamp": "2025-04-24T16:17:02Z",
          "tree_id": "8bfe068c3e5eba659247d52b2901a28c6f73a04c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1f9603eefccf7d9bbb12df086b10c949a880e8c3"
        },
        "date": 1745516648120,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9357,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2678784774644552,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 151386,
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
          "id": "34538b29316cb9cbbbf792d11c814108b549b924",
          "message": "fix: Handle undefined proverCoordinationNodeUrls (#13804)\n\nGot hit by the following when deploying:\n\n```\nTypeError: Cannot read properties of undefined (reading 'length') at createProverCoordination (file:///usr/src/yarn-project/prover-node/dest/prover-coordination/factory.js:35:43) at createProverNode (file:///usr/src/yarn-project/prover-node/dest/factory.js:50:38) at process.processTicksAndRejections (node:internal/process/task_queues:95:5) at async startProverNode (file:///usr/src/yarn-project/aztec/dest/cli/cmds/start_prover_node.js:81:24) at async aztecStart (file:///usr/src/yarn-project/aztec/dest/cli/aztec_start_action.js:54:27) at async Command.<anonymous> (file:///usr/src/yarn-project/aztec/dest/cli/cli.js:17:16) at async Command.parseAsync (/usr/src/yarn-project/node_modules/commander/lib/command.js:1092:5) at async main (file:///usr/src/yarn-project/aztec/dest/bin/index.js:48:5)\n```",
          "timestamp": "2025-04-24T18:37:31Z",
          "tree_id": "a83565ceeddcc1f237aa03cd05a9da70c4ea264a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/34538b29316cb9cbbbf792d11c814108b549b924"
        },
        "date": 1745523425012,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9315,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26666659555557454,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 164078,
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
          "id": "549c254cf89e44fdf883d0950dae36e50822c28f",
          "message": "chore: skip hinting for tree padding (#13818)\n\nBefore\n\n![image](https://github.com/user-attachments/assets/2933fef3-a1b5-45e4-882a-b6374d1682dc)\n\nAfter\n\n![image](https://github.com/user-attachments/assets/6e1b2db9-7e9d-49d5-acdf-810f1901c210)\n\nCo-authored-by: dbanks12 <david@aztecprotocol.com>",
          "timestamp": "2025-04-24T18:39:32Z",
          "tree_id": "5737334c0287e11c1f539123c12c9fec9c39f2f7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/549c254cf89e44fdf883d0950dae36e50822c28f"
        },
        "date": 1745524731863,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8142,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2330849657633148,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 139315,
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
          "id": "d9146b29f07702a40dec81937e3703c97de701df",
          "message": "refactor(avm): some fixes and faster tests (#13785)\n\nThis PR does a few things\n* Improves the way to check for previously initialized polynomials in\n`compute_polynomials`.\n* Removes `AllConstRefEntities` from the flavor, and also\n`get_standard_row` from the polys. This is not used in \"prod\" and was\nonly used for check_circut and other things.\n* Creates an equivalent concept of `AvmFullRowConstRef` which is a row\nof references, similar to what was `AllConstRefEntities`.\n* We now use the above directly in check_circuit AND in tests, which\navoids creating full rows of fields.\n* This allowed some simplifications in `check_relation`.\n\nSome improvements: running all C++ VM2 tests (without goblin):\n* Before: 43s\n* After: 15s",
          "timestamp": "2025-04-24T18:47:23Z",
          "tree_id": "5962714a705727335143ee5ce153a9c9a16d5e19",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d9146b29f07702a40dec81937e3703c97de701df"
        },
        "date": 1745526435658,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8603,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24629213350314355,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 159107,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "helloworld@mcgee.cat",
            "name": "Cat McGee",
            "username": "catmcgee"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "115611990d3a57bba60b5dde06929452ddac6c3a",
          "message": "feat(docs): \"try testnet\" collation page (#11299)\n\nCloses https://github.com/AztecProtocol/aztec-packages/issues/10493\nCloses https://github.com/AztecProtocol/aztec-packages/issues/10538\nCloses https://github.com/AztecProtocol/aztec-packages/issues/11723\n\nnot fully ready for review but i'd appreciate a look on the \"try\ntestnet\" and \"getting started with testnet\" pages\n\n---------\n\nCo-authored-by: Rahul Kothari <rahul.kothari.201@gmail.com>\nCo-authored-by: josh crites <critesjosh@gmail.com>\nCo-authored-by: Josh Crites <jc@joshcrites.com>",
          "timestamp": "2025-04-24T20:38:35Z",
          "tree_id": "baaa80f4982ace9166b414dd47fb379d807004a0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/115611990d3a57bba60b5dde06929452ddac6c3a"
        },
        "date": 1745531397247,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8314,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23802473743491215,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 145778,
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
          "distinct": true,
          "id": "eadb87d8550fd069ab72705b0fe9ed6b355220ad",
          "message": "feat: Add pairing points for all Honk circuits (#13701)\n\nWe add a couple of checks to enforce that honk circuits add exactly ONE\npairing point object to its public outputs. The first check is in the\nDeciderProvingKey constructor, which all flows use to create the proving\nkey from the circuit, and it checks that the pairing point object has\nbeen set in the builder. The second check happens in the\naggregation_state itself, where if we try to call set_public() and the\nbuilder already has one set, it will throw an error.\n\nThese checks require us to add pairing point objects to a lot of\ndifferent tests and also move around some of the logic to more proper\npositions (like from accumulate() to complete_kernel_circuit_logic()).\nPreviously, we had varying amounts of pairing point objects for Mega\ncircuits, but now that shouldn't be the case.",
          "timestamp": "2025-04-24T20:58:53Z",
          "tree_id": "181e85f3136a6c12d2953a7406ec7229d2932a86",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/eadb87d8550fd069ab72705b0fe9ed6b355220ad"
        },
        "date": 1745531913359,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8613,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2465783554505899,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 150575,
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
          "id": "4cb40fdd1f1a053c64abab21ef25502489541ed8",
          "message": "chore: assert on bad public component key (#13827)\n\nAbort when attempting to reconstruct a PublicInputComponent with a key\nthat leads to overreading the public inputs.\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1372",
          "timestamp": "2025-04-25T02:44:20Z",
          "tree_id": "d907c33307fcf1f2b4a746c2aed7471dfd40002a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4cb40fdd1f1a053c64abab21ef25502489541ed8"
        },
        "date": 1745554599394,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8218,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2352713101694612,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 149961,
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
          "id": "32262af5946c2d6848d8021441f205d3f5cb7fc2",
          "message": "fix: sponsored fpc playground versioning (#13831)\n\nAllows using fixed artifacts for particular networks. Requires\nhttps://github.com/AztecProtocol/aztec-packages/pull/13830 to be merged\nso it works with playground.\n\nAlso sneaky fix for bad defaults on cli-wallet account deployments\n\n---------\n\nCo-authored-by: saleel <saleel@aztecprotocol.com>",
          "timestamp": "2025-04-25T06:45:28Z",
          "tree_id": "4f6f43826eb2259213356f6b53acb4eab19e4f42",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/32262af5946c2d6848d8021441f205d3f5cb7fc2"
        },
        "date": 1745567011913,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8388,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24013074638879378,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 143865,
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
          "id": "fb7f80f9a1db7f6e71e0e63a10d6458d396e90f2",
          "message": "feat: Script for donwloading and running failed epoch proof (#13822)\n\nAdds a one-liner that, given an URL for an uploaded failed epoch proving\njob, downloads and re-runs it.\n\nExample run:\n\n```\n$ PROVER_REAL_PROOFS=false yarn run-failed-epoch 'gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642' /tmp/epoch-test\n\n[17:11:21.921] INFO: prover-node:run-failed-epoch Downloading epoch proving job data and state from gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642 to /tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642\n[17:11:21.921] INFO: prover-node:run-failed-epoch Downloading epoch proving job data from gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642\n[17:11:21.921] INFO: stdlib:file-store Creating google cloud file store at aztec-develop palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642\n[17:11:24.429] INFO: prover-node:run-failed-epoch Downloading state snapshot from gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642 to local data directory {\"metadata\":{\"l2BlockNumber\":104,\"l2BlockHash\":\"0x26f2c7651ab1ff2e787a12cd7003b603f36fbb85f6b56060547a366ab86fdbd9\",\"l1BlockNumber\":219,\"l1ChainId\":1337,\"rollupVersion\":3184683497,\"rollupAddress\":\"0x11ea6beac329629007a630d53d0a76831d8ed452\"},\"dataUrls\":{\"archiver\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/archiver.db\",\"nullifier-tree\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/nullifier-tree.db\",\"public-data-tree\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/public-data-tree.db\",\"note-hash-tree\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/note-hash-tree.db\",\"archive-tree\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/archive-tree.db\",\"l1-to-l2-message-tree\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/l1-to-l2-message-tree.db\"}}\n[17:11:24.429] INFO: prover-node:run-failed-epoch Creating google cloud file store at aztec-develop palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642\n[17:11:25.599] INFO: prover-node:run-failed-epoch Downloading snapshot to /tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/download-tTi6tA {\"snapshot\":{\"dataUrls\":{\"archiver\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/archiver.db\",\"nullifier-tree\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/nullifier-tree.db\",\"public-data-tree\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/public-data-tree.db\",\"note-hash-tree\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/note-hash-tree.db\",\"archive-tree\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/archive-tree.db\",\"l1-to-l2-message-tree\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/l1-to-l2-message-tree.db\"}},\"downloadPaths\":{\"archiver\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/download-tTi6tA/archiver.db\",\"nullifier-tree\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/download-tTi6tA/nullifier-tree.db\",\"public-data-tree\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/download-tTi6tA/public-data-tree.db\",\"note-hash-tree\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/download-tTi6tA/note-hash-tree.db\",\"archive-tree\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/download-tTi6tA/archive-tree.db\",\"l1-to-l2-message-tree\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/download-tTi6tA/l1-to-l2-message-tree.db\"}}\n[17:11:27.391] INFO: prover-node:run-failed-epoch Snapshot downloaded at /tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/download-tTi6tA {\"snapshot\":{\"dataUrls\":{\"archiver\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/archiver.db\",\"nullifier-tree\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/nullifier-tree.db\",\"public-data-tree\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/public-data-tree.db\",\"note-hash-tree\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/note-hash-tree.db\",\"archive-tree\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/archive-tree.db\",\"l1-to-l2-message-tree\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/l1-to-l2-message-tree.db\"}},\"downloadPaths\":{\"archiver\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/download-tTi6tA/archiver.db\",\"nullifier-tree\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/download-tTi6tA/nullifier-tree.db\",\"public-data-tree\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/download-tTi6tA/public-data-tree.db\",\"note-hash-tree\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/download-tTi6tA/note-hash-tree.db\",\"archive-tree\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/download-tTi6tA/archive-tree.db\",\"l1-to-l2-message-tree\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/download-tTi6tA/l1-to-l2-message-tree.db\"}}\n[17:11:27.393] INFO: prover-node:run-failed-epoch Archiver database set up from snapshot {\"path\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/archiver\",\"dbVersion\":1,\"rollupAddress\":\"0x11ea6beac329629007a630d53d0a76831d8ed452\"}\n[17:11:27.393] INFO: prover-node:run-failed-epoch World state database l1-to-l2-message-tree set up from snapshot {\"path\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/world_state/L1ToL2MessageTree\",\"dbVersion\":1,\"rollupAddress\":\"0x11ea6beac329629007a630d53d0a76831d8ed452\"}\n[17:11:27.394] INFO: prover-node:run-failed-epoch World state database archive-tree set up from snapshot {\"path\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/world_state/ArchiveTree\",\"dbVersion\":1,\"rollupAddress\":\"0x11ea6beac329629007a630d53d0a76831d8ed452\"}\n[17:11:27.394] INFO: prover-node:run-failed-epoch World state database public-data-tree set up from snapshot {\"path\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/world_state/PublicDataTree\",\"dbVersion\":1,\"rollupAddress\":\"0x11ea6beac329629007a630d53d0a76831d8ed452\"}\n[17:11:27.394] INFO: prover-node:run-failed-epoch World state database note-hash-tree set up from snapshot {\"path\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/world_state/NoteHashTree\",\"dbVersion\":1,\"rollupAddress\":\"0x11ea6beac329629007a630d53d0a76831d8ed452\"}\n[17:11:27.394] INFO: prover-node:run-failed-epoch World state database nullifier-tree set up from snapshot {\"path\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/world_state/NullifierTree\",\"dbVersion\":1,\"rollupAddress\":\"0x11ea6beac329629007a630d53d0a76831d8ed452\"}\n[17:11:27.395] INFO: prover-node:run-failed-epoch Downloading epoch proving job data from gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/data.bin to /tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/data.bin\n[17:11:28.368] INFO: prover-node:run-failed-epoch Epoch proving job data for epoch 26 downloaded successfully\n[17:11:28.375] INFO: prover-node:run-failed-epoch Download to /tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642 complete\n[17:11:28.375] INFO: prover-node:run-failed-epoch Rerunning proving job from /tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/data.bin with state from /tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state {\"l2BlockNumber\":104,\"l2BlockHash\":\"0x26f2c7651ab1ff2e787a12cd7003b603f36fbb85f6b56060547a366ab86fdbd9\",\"l1BlockNumber\":219,\"l1ChainId\":1337,\"rollupVersion\":3184683497,\"rollupAddress\":\"0x11ea6beac329629007a630d53d0a76831d8ed452\"}\n[17:11:28.375] INFO: prover-node:run-failed-epoch Loaded proving job data for epoch 26\n[17:11:28.378] INFO: world-state:database Creating world state data store at directory /tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/world_state with map size 134217728 KB and 1 threads.\n[17:11:28.389] INFO: archiver:lmdb Creating archiver data store at directory /tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/archiver with map size 134217728 KB (LMDB v2)\n[17:11:28.390] INFO: archiver:lmdb Starting data store with maxReaders 16\n[17:11:28.392] WARN: prover-client:proving-broker-database Found invalid epoch directory /tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/archiver when loading epoch databases, ignoring\n[17:11:28.392] WARN: prover-client:proving-broker-database Found invalid epoch directory /tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/world_state when loading epoch databases, ignoring\n[17:11:28.392] INFO: prover-client:proving-broker Proving Broker started\n[17:11:28.393] INFO: prover-node:run-failed-epoch Rerunning epoch proving job for epoch 26\n[17:11:28.394] WARN: prover-node:epoch-proving-job No L2 block source available, skipping epoch check\n[17:11:28.394] INFO: prover-node:epoch-proving-job Starting epoch 26 proving job with blocks 101 to 104 {\"fromBlock\":101,\"toBlock\":104,\"epochSizeBlocks\":4,\"epochNumber\":26,\"uuid\":\"29459f0f-5fc1-4257-a630-8c95a87a7c8f\"}\n[17:11:28.394] INFO: prover-client:orchestrator Starting epoch 26 with 4 blocks\n[17:11:28.395] INFO: prover-client:orchestrator Starting block 101 for slot 104\n[17:11:28.396] INFO: prover-client:orchestrator Starting block 102 for slot 105\n[17:11:28.397] INFO: prover-client:orchestrator Starting block 103 for slot 106\n[17:11:28.397] INFO: prover-client:orchestrator Starting block 104 for slot 107\n[17:11:28.403] INFO: prover-client:proving-broker New proving job id=26:BASE_PARITY:7b66e84142d309333defc85471e4d242c55ab0b72a716279c7c23e4430c31db1 epochNumber=26 {\"provingJobId\":\"26:BASE_PARITY:7b66e84142d309333defc85471e4d242c55ab0b72a716279c7c23e4430c31db1\"}\n[17:11:28.412] INFO: simulator:public-processor Processed 0 successful txs and 0 failed txs in 0.000034478001296520235s {\"duration\":0.000034478001296520235,\"rate\":0,\"totalPublicGas\":{\"daGas\":0,\"l2Gas\":0},\"totalBlockGas\":{\"daGas\":0,\"l2Gas\":0},\"totalSizeInBytes\":0}\n[17:11:28.412] WARN: prover-client:orchestrator Provided no txs to orchestrator addTxs.\n[17:11:28.414] INFO: simulator:public-processor Processed 0 successful txs and 0 failed txs in 0.000007936999201774598s {\"duration\":0.000007936999201774598,\"rate\":0,\"totalPublicGas\":{\"daGas\":0,\"l2Gas\":0},\"totalBlockGas\":{\"daGas\":0,\"l2Gas\":0},\"totalSizeInBytes\":0}\n[17:11:28.414] WARN: prover-client:orchestrator Provided no txs to orchestrator addTxs.\n[17:11:28.421] INFO: simulator:public-processor Processed 0 successful txs and 0 failed txs in 0.000005669999867677689s {\"duration\":0.000005669999867677689,\"rate\":0,\"totalPublicGas\":{\"daGas\":0,\"l2Gas\":0},\"totalBlockGas\":{\"daGas\":0,\"l2Gas\":0},\"totalSizeInBytes\":0}\n[17:11:28.421] WARN: prover-client:orchestrator Provided no txs to orchestrator addTxs.\n[17:11:28.428] INFO: simulator:public-processor Processed 0 successful txs and 0 failed txs in 0.000005761001259088517s {\"duration\":0.000005761001259088517,\"rate\":0,\"totalPublicGas\":{\"daGas\":0,\"l2Gas\":0},\"totalBlockGas\":{\"daGas\":0,\"l2Gas\":0},\"totalSizeInBytes\":0}\n[17:11:28.428] WARN: prover-client:orchestrator Provided no txs to orchestrator addTxs.\n[17:11:28.454] INFO: prover-client:proving-broker-database Creating broker database for epoch 26 at /tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/26 with map size 134217728\n[17:11:28.456] INFO: kv-store:lmdb-v2 Starting data store with maxReaders 16\n[17:11:28.494] INFO: prover-client:proving-agent Starting job id=26:BASE_PARITY:7b66e84142d309333defc85471e4d242c55ab0b72a716279c7c23e4430c31db1 type=BASE_PARITY inputsUri=data:application/json;charset=utf-8,%7B%22type%22%3A9%2C%22input...\n[17:11:28.495] INFO: prover-client:proving-agent:job-controller-05d8627b Job controller started jobId=26:BASE_PARITY:7b66e84142d309333defc85471e4d242c55ab0b72a716279c7c23e4430c31db1 {\"jobId\":\"26:BASE_PARITY:7b66e84142d309333defc85471e4d242c55ab0b72a716279c7c23e4430c31db1\"}\n[17:11:28.530] INFO: prover-client:proving-agent Job id=26:BASE_PARITY:7b66e84142d309333defc85471e4d242c55ab0b72a716279c7c23e4430c31db1 type=BASE_PARITY completed outputUri=data:application/json;charset=utf-8,%7B%22type%22%3A9%2C%22resul...\n[17:11:28.530] INFO: prover-client:proving-broker Proving job complete id=26:BASE_PARITY:7b66e84142d309333defc85471e4d242c55ab0b72a716279c7c23e4430c31db1 type=BASE_PARITY totalAttempts=1 {\"provingJobId\":\"26:BASE_PARITY:7b66e84142d309333defc85471e4d242c55ab0b72a716279c7c23e4430c31db1\"}\n[17:11:29.405] INFO: prover-client:proving-broker New proving job id=26:ROOT_PARITY:79df3b651dec4aadded8c73af550295a575a0f31e8cb1803085b3749374084b3 epochNumber=26 {\"provingJobId\":\"26:ROOT_PARITY:79df3b651dec4aadded8c73af550295a575a0f31e8cb1803085b3749374084b3\"}\n[17:11:29.489] INFO: prover-client:proving-agent Starting job id=26:ROOT_PARITY:79df3b651dec4aadded8c73af550295a575a0f31e8cb1803085b3749374084b3 type=ROOT_PARITY inputsUri=data:application/json;charset=utf-8,%7B%22type%22%3A10%2C%22inpu...\n[17:11:29.498] INFO: prover-client:proving-agent:job-controller-12df7151 Job controller started jobId=26:ROOT_PARITY:79df3b651dec4aadded8c73af550295a575a0f31e8cb1803085b3749374084b3 {\"jobId\":\"26:ROOT_PARITY:79df3b651dec4aadded8c73af550295a575a0f31e8cb1803085b3749374084b3\"}\n[17:11:29.542] INFO: prover-client:proving-agent Job id=26:ROOT_PARITY:79df3b651dec4aadded8c73af550295a575a0f31e8cb1803085b3749374084b3 type=ROOT_PARITY completed outputUri=data:application/json;charset=utf-8,%7B%22type%22%3A10%2C%22resu...\n[17:11:29.542] INFO: prover-client:proving-broker Proving job complete id=26:ROOT_PARITY:79df3b651dec4aadded8c73af550295a575a0f31e8cb1803085b3749374084b3 type=ROOT_PARITY totalAttempts=1 {\"provingJobId\":\"26:ROOT_PARITY:79df3b651dec4aadded8c73af550295a575a0f31e8cb1803085b3749374084b3\"}\n[17:11:30.397] INFO: prover-client:proving-broker New proving job id=26:EMPTY_BLOCK_ROOT_ROLLUP:addf992ccad2fbdb518ef246e0ae772f1f6fc0561309a5a654eaba268e8ea453 epochNumber=26 {\"provingJobId\":\"26:EMPTY_BLOCK_ROOT_ROLLUP:addf992ccad2fbdb518ef246e0ae772f1f6fc0561309a5a654eaba268e8ea453\"}\n[17:11:30.399] INFO: prover-client:proving-broker New proving job id=26:EMPTY_BLOCK_ROOT_ROLLUP:24a57be82ef0668fcb2e9717246e1acf72404f818326d62891170ada648965a4 epochNumber=26 {\"provingJobId\":\"26:EMPTY_BLOCK_ROOT_ROLLUP:24a57be82ef0668fcb2e9717246e1acf72404f818326d62891170ada648965a4\"}\n[17:11:30.400] INFO: prover-client:proving-broker New proving job id=26:EMPTY_BLOCK_ROOT_ROLLUP:9f47be45839c0a5192ff3a564c692d2005be651e66c8b05ad24a03946159a175 epochNumber=26 {\"provingJobId\":\"26:EMPTY_BLOCK_ROOT_ROLLUP:9f47be45839c0a5192ff3a564c692d2005be651e66c8b05ad24a03946159a175\"}\n[17:11:30.401] INFO: prover-client:proving-broker New proving job id=26:EMPTY_BLOCK_ROOT_ROLLUP:01801b76914f2b1c15fb9e253396bbb19d371c6851b317fd19d8dfcb33f27d7d epochNumber=26 {\"provingJobId\":\"26:EMPTY_BLOCK_ROOT_ROLLUP:01801b76914f2b1c15fb9e253396bbb19d371c6851b317fd19d8dfcb33f27d7d\"}\n[17:11:30.505] INFO: prover-client:proving-agent Starting job id=26:EMPTY_BLOCK_ROOT_ROLLUP:addf992ccad2fbdb518ef246e0ae772f1f6fc0561309a5a654eaba268e8ea453 type=EMPTY_BLOCK_ROOT_ROLLUP inputsUri=data:application/json;charset=utf-8,%7B%22type%22%3A4%2C%22input...\n[17:11:30.509] INFO: prover-client:proving-agent:job-controller-def82bf7 Job controller started jobId=26:EMPTY_BLOCK_ROOT_ROLLUP:addf992ccad2fbdb518ef246e0ae772f1f6fc0561309a5a654eaba268e8ea453 {\"jobId\":\"26:EMPTY_BLOCK_ROOT_ROLLUP:addf992ccad2fbdb518ef246e0ae772f1f6fc0561309a5a654eaba268e8ea453\"}\n[17:11:30.538] INFO: prover-client:proving-agent Job id=26:EMPTY_BLOCK_ROOT_ROLLUP:addf992ccad2fbdb518ef246e0ae772f1f6fc0561309a5a654eaba268e8ea453 type=EMPTY_BLOCK_ROOT_ROLLUP completed outputUri=data:application/json;charset=utf-8,%7B%22type%22%3A4%2C%22resul...\n[17:11:30.538] INFO: prover-client:proving-broker Proving job complete id=26:EMPTY_BLOCK_ROOT_ROLLUP:addf992ccad2fbdb518ef246e0ae772f1f6fc0561309a5a654eaba268e8ea453 type=EMPTY_BLOCK_ROOT_ROLLUP totalAttempts=1 {\"provingJobId\":\"26:EMPTY_BLOCK_ROOT_ROLLUP:addf992ccad2fbdb518ef246e0ae772f1f6fc0561309a5a654eaba268e8ea453\"}\n[17:11:30.591] INFO: prover-client:proving-agent Starting job id=26:EMPTY_BLOCK_ROOT_ROLLUP:24a57be82ef0668fcb2e9717246e1acf72404f818326d62891170ada648965a4 type=EMPTY_BLOCK_ROOT_ROLLUP inputsUri=data:application/json;charset=utf-8,%7B%22type%22%3A4%2C%22input...\n[17:11:30.594] INFO: prover-client:proving-agent:job-controller-271ca88f Job controller started jobId=26:EMPTY_BLOCK_ROOT_ROLLUP:24a57be82ef0668fcb2e9717246e1acf72404f818326d62891170ada648965a4 {\"jobId\":\"26:EMPTY_BLOCK_ROOT_ROLLUP:24a57be82ef0668fcb2e9717246e1acf72404f818326d62891170ada648965a4\"}\n[17:11:30.619] INFO: prover-client:proving-agent Job id=26:EMPTY_BLOCK_ROOT_ROLLUP:24a57be82ef0668fcb2e9717246e1acf72404f818326d62891170ada648965a4 type=EMPTY_BLOCK_ROOT_ROLLUP completed outputUri=data:application/json;charset=utf-8,%7B%22type%22%3A4%2C%22resul...\n[17:11:30.619] INFO: prover-client:proving-broker Proving job complete id=26:EMPTY_BLOCK_ROOT_ROLLUP:24a57be82ef0668fcb2e9717246e1acf72404f818326d62891170ada648965a4 type=EMPTY_BLOCK_ROOT_ROLLUP totalAttempts=1 {\"provingJobId\":\"26:EMPTY_BLOCK_ROOT_ROLLUP:24a57be82ef0668fcb2e9717246e1acf72404f818326d62891170ada648965a4\"}\n[17:11:30.672] INFO: prover-client:proving-agent Starting job id=26:EMPTY_BLOCK_ROOT_ROLLUP:9f47be45839c0a5192ff3a564c692d2005be651e66c8b05ad24a03946159a175 type=EMPTY_BLOCK_ROOT_ROLLUP inputsUri=data:application/json;charset=utf-8,%7B%22type%22%3A4%2C%22input...\n[17:11:30.674] INFO: prover-client:proving-agent:job-controller-feb02ad8 Job controller started jobId=26:EMPTY_BLOCK_ROOT_ROLLUP:9f47be45839c0a5192ff3a564c692d2005be651e66c8b05ad24a03946159a175 {\"jobId\":\"26:EMPTY_BLOCK_ROOT_ROLLUP:9f47be45839c0a5192ff3a564c692d2005be651e66c8b05ad24a03946159a175\"}\n[17:11:30.699] INFO: prover-client:proving-agent Job id=26:EMPTY_BLOCK_ROOT_ROLLUP:9f47be45839c0a5192ff3a564c692d2005be651e66c8b05ad24a03946159a175 type=EMPTY_BLOCK_ROOT_ROLLUP completed outputUri=data:application/json;charset=utf-8,%7B%22type%22%3A4%2C%22resul...\n[17:11:30.699] INFO: prover-client:proving-broker Proving job complete id=26:EMPTY_BLOCK_ROOT_ROLLUP:9f47be45839c0a5192ff3a564c692d2005be651e66c8b05ad24a03946159a175 type=EMPTY_BLOCK_ROOT_ROLLUP totalAttempts=1 {\"provingJobId\":\"26:EMPTY_BLOCK_ROOT_ROLLUP:9f47be45839c0a5192ff3a564c692d2005be651e66c8b05ad24a03946159a175\"}\n[17:11:30.753] INFO: prover-client:proving-agent Starting job id=26:EMPTY_BLOCK_ROOT_ROLLUP:01801b76914f2b1c15fb9e253396bbb19d371c6851b317fd19d8dfcb33f27d7d type=EMPTY_BLOCK_ROOT_ROLLUP inputsUri=data:application/json;charset=utf-8,%7B%22type%22%3A4%2C%22input...\n[17:11:30.755] INFO: prover-client:proving-agent:job-controller-41cdfcfc Job controller started jobId=26:EMPTY_BLOCK_ROOT_ROLLUP:01801b76914f2b1c15fb9e253396bbb19d371c6851b317fd19d8dfcb33f27d7d {\"jobId\":\"26:EMPTY_BLOCK_ROOT_ROLLUP:01801b76914f2b1c15fb9e253396bbb19d371c6851b317fd19d8dfcb33f27d7d\"}\n[17:11:30.781] INFO: prover-client:proving-agent Job id=26:EMPTY_BLOCK_ROOT_ROLLUP:01801b76914f2b1c15fb9e253396bbb19d371c6851b317fd19d8dfcb33f27d7d type=EMPTY_BLOCK_ROOT_ROLLUP completed outputUri=data:application/json;charset=utf-8,%7B%22type%22%3A4%2C%22resul...\n[17:11:30.781] INFO: prover-client:proving-broker Proving job complete id=26:EMPTY_BLOCK_ROOT_ROLLUP:01801b76914f2b1c15fb9e253396bbb19d371c6851b317fd19d8dfcb33f27d7d type=EMPTY_BLOCK_ROOT_ROLLUP totalAttempts=1 {\"provingJobId\":\"26:EMPTY_BLOCK_ROOT_ROLLUP:01801b76914f2b1c15fb9e253396bbb19d371c6851b317fd19d8dfcb33f27d7d\"}\n[17:11:31.407] INFO: prover-client:proving-broker New proving job id=26:BLOCK_MERGE_ROLLUP:eaa676140725197c2567e551b420811775e1577b71a8cc48da71815168749b60 epochNumber=26 {\"provingJobId\":\"26:BLOCK_MERGE_ROLLUP:eaa676140725197c2567e551b420811775e1577b71a8cc48da71815168749b60\"}\n[17:11:31.412] INFO: prover-client:proving-broker New proving job id=26:BLOCK_MERGE_ROLLUP:8848eeffa964c9bba3ad837806f4b9b441dc88b7d23341d3b684174415479ea4 epochNumber=26 {\"provingJobId\":\"26:BLOCK_MERGE_ROLLUP:8848eeffa964c9bba3ad837806f4b9b441dc88b7d23341d3b684174415479ea4\"}\n[17:11:31.539] INFO: prover-client:proving-agent Starting job id=26:BLOCK_MERGE_ROLLUP:eaa676140725197c2567e551b420811775e1577b71a8cc48da71815168749b60 type=BLOCK_MERGE_ROLLUP inputsUri=data:application/json;charset=utf-8,%7B%22type%22%3A7%2C%22input...\n[17:11:31.555] INFO: prover-client:proving-agent:job-controller-052bf782 Job controller started jobId=26:BLOCK_MERGE_ROLLUP:eaa676140725197c2567e551b420811775e1577b71a8cc48da71815168749b60 {\"jobId\":\"26:BLOCK_MERGE_ROLLUP:eaa676140725197c2567e551b420811775e1577b71a8cc48da71815168749b60\"}\n[17:11:31.626] INFO: prover-client:proving-agent Job id=26:BLOCK_MERGE_ROLLUP:eaa676140725197c2567e551b420811775e1577b71a8cc48da71815168749b60 type=BLOCK_MERGE_ROLLUP completed outputUri=data:application/json;charset=utf-8,%7B%22type%22%3A7%2C%22resul...\n[17:11:31.626] INFO: prover-client:proving-broker Proving job complete id=26:BLOCK_MERGE_ROLLUP:eaa676140725197c2567e551b420811775e1577b71a8cc48da71815168749b60 type=BLOCK_MERGE_ROLLUP totalAttempts=1 {\"provingJobId\":\"26:BLOCK_MERGE_ROLLUP:eaa676140725197c2567e551b420811775e1577b71a8cc48da71815168749b60\"}\n[17:11:31.687] INFO: prover-client:proving-agent Starting job id=26:BLOCK_MERGE_ROLLUP:8848eeffa964c9bba3ad837806f4b9b441dc88b7d23341d3b684174415479ea4 type=BLOCK_MERGE_ROLLUP inputsUri=data:application/json;charset=utf-8,%7B%22type%22%3A7%2C%22input...\n[17:11:31.699] INFO: prover-client:proving-agent:job-controller-dbd72897 Job controller started jobId=26:BLOCK_MERGE_ROLLUP:8848eeffa964c9bba3ad837806f4b9b441dc88b7d23341d3b684174415479ea4 {\"jobId\":\"26:BLOCK_MERGE_ROLLUP:8848eeffa964c9bba3ad837806f4b9b441dc88b7d23341d3b684174415479ea4\"}\n[17:11:31.767] INFO: prover-client:proving-agent Job id=26:BLOCK_MERGE_ROLLUP:8848eeffa964c9bba3ad837806f4b9b441dc88b7d23341d3b684174415479ea4 type=BLOCK_MERGE_ROLLUP completed outputUri=data:application/json;charset=utf-8,%7B%22type%22%3A7%2C%22resul...\n[17:11:31.767] INFO: prover-client:proving-broker Proving job complete id=26:BLOCK_MERGE_ROLLUP:8848eeffa964c9bba3ad837806f4b9b441dc88b7d23341d3b684174415479ea4 type=BLOCK_MERGE_ROLLUP totalAttempts=1 {\"provingJobId\":\"26:BLOCK_MERGE_ROLLUP:8848eeffa964c9bba3ad837806f4b9b441dc88b7d23341d3b684174415479ea4\"}\n[17:11:32.406] INFO: prover-client:proving-broker New proving job id=26:ROOT_ROLLUP:48d24e60f54518fdf4cc9f352ae967d14a6dbc2824d931510eccff48ea57140c epochNumber=26 {\"provingJobId\":\"26:ROOT_ROLLUP:48d24e60f54518fdf4cc9f352ae967d14a6dbc2824d931510eccff48ea57140c\"}\n[17:11:32.532] INFO: prover-client:proving-agent Starting job id=26:ROOT_ROLLUP:48d24e60f54518fdf4cc9f352ae967d14a6dbc2824d931510eccff48ea57140c type=ROOT_ROLLUP inputsUri=data:application/json;charset=utf-8,%7B%22type%22%3A8%2C%22input...\n[17:11:32.544] INFO: prover-client:proving-agent:job-controller-79d49f12 Job controller started jobId=26:ROOT_ROLLUP:48d24e60f54518fdf4cc9f352ae967d14a6dbc2824d931510eccff48ea57140c {\"jobId\":\"26:ROOT_ROLLUP:48d24e60f54518fdf4cc9f352ae967d14a6dbc2824d931510eccff48ea57140c\"}\n[17:11:32.609] INFO: prover-client:proving-agent Job id=26:ROOT_ROLLUP:48d24e60f54518fdf4cc9f352ae967d14a6dbc2824d931510eccff48ea57140c type=ROOT_ROLLUP completed outputUri=data:application/json;charset=utf-8,%7B%22type%22%3A8%2C%22resul...\n[17:11:32.609] INFO: prover-client:proving-broker Proving job complete id=26:ROOT_ROLLUP:48d24e60f54518fdf4cc9f352ae967d14a6dbc2824d931510eccff48ea57140c type=ROOT_ROLLUP totalAttempts=1 {\"provingJobId\":\"26:ROOT_ROLLUP:48d24e60f54518fdf4cc9f352ae967d14a6dbc2824d931510eccff48ea57140c\"}\nEpoch proving job complete with result completed\n[17:11:33.403] INFO: prover-node:epoch-proving-job Finalised proof for epoch 26 {\"epochNumber\":26,\"uuid\":\"29459f0f-5fc1-4257-a630-8c95a87a7c8f\",\"duration\":5009.350722000003}\n[17:11:33.403] INFO: prover-node:epoch-proving-job Submitted proof for epoch 26 (blocks 101 to 104) {\"epochNumber\":26,\"uuid\":\"29459f0f-5fc1-4257-a630-8c95a87a7c8f\"}\n[17:11:33.403] INFO: prover-node:run-failed-epoch Completed job for epoch 26 with status completed\n```",
          "timestamp": "2025-04-25T12:13:15Z",
          "tree_id": "7912a959748b90b3b1591753ad38b29fe61c0f82",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fb7f80f9a1db7f6e71e0e63a10d6458d396e90f2"
        },
        "date": 1745587655830,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8195,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23462293044978624,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 137142,
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
          "id": "17207b44bcb762ee9c7dcbf84f3744f38f64eb69",
          "message": "feat: Expose bot address in API (#13842)\n\nAdds a `getInfo` method to the bot api to get its address.\n\nRelated to #13788",
          "timestamp": "2025-04-25T14:52:46Z",
          "tree_id": "5408d741fc7a911bf558e79669b51e918ee85e24",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/17207b44bcb762ee9c7dcbf84f3744f38f64eb69"
        },
        "date": 1745597082505,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8215,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23518725962392145,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 145144,
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
          "id": "40a976288c08995273f2089d8b30031ab752b656",
          "message": "chore: use L1 TX utils for L1 validator CLI actions (#13838)\n\nuse l1 tx utils to capture ABI errors on the CLI",
          "timestamp": "2025-04-25T15:03:51Z",
          "tree_id": "e43fd4800c35d85f3f0f64b23bb6b37dc3ef7ad2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/40a976288c08995273f2089d8b30031ab752b656"
        },
        "date": 1745598513012,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8092,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23167846180328786,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 158263,
            "unit": "us"
          }
        ]
      }
    ]
  }
}