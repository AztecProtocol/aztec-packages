window.BENCHMARK_DATA = {
  "lastUpdate": 1745366818268,
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
          "id": "9f0ff4a6bfed5f53ec2512e32c733e194c928cb7",
          "message": "chore: Updated contract addresses for alpha-testnet (#13585)\n\nThis PR simply updates the alpha-testnet contract addresses",
          "timestamp": "2025-04-16T13:54:07Z",
          "tree_id": "a829796f55fd5d13553aa1c05d6def06693f522d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9f0ff4a6bfed5f53ec2512e32c733e194c928cb7"
        },
        "date": 1744815219132,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9576,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2572876733475699,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 142845,
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
          "id": "60e73f987f850ad0db8fcdce3e9e9d092f2fc0d0",
          "message": "chore: Fetch rollup address using version as index (#13620)\n\nIf fetching the rollup address given a version identifier fails, it\ntries again using it as an index instead.",
          "timestamp": "2025-04-16T16:43:39Z",
          "tree_id": "c230c80adfb26d86a4c41c3d290518f687d5d1db",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/60e73f987f850ad0db8fcdce3e9e9d092f2fc0d0"
        },
        "date": 1744825246881,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9538,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.25627134419958003,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 140922,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "35969035+varex83@users.noreply.github.com",
            "name": "Bohdan Ohorodnii",
            "username": "varex83"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "4264c8cbcd0a44bab5c50ff1a3a28cc441b7b060",
          "message": "feat(p2p): add private peers (#12585)\n\nCloses #12444\n\n---------\n\nCo-authored-by: Nate Beauregard <nathanbeauregard@gmail.com>\nCo-authored-by: Maddiaa <47148561+Maddiaa0@users.noreply.github.com>\nCo-authored-by: Nate Beauregard <51711291+natebeauregard@users.noreply.github.com>",
          "timestamp": "2025-04-16T17:16:57Z",
          "tree_id": "06dd25b616ff83fd16fe835e26928140394f1c2b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4264c8cbcd0a44bab5c50ff1a3a28cc441b7b060"
        },
        "date": 1744827338014,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9714,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26099765832900945,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 152126,
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
          "id": "70c58ab773c7e8e2ed2bcc4eb7acbeec31477200",
          "message": "fix: update metric name to avoid conflicts (#13629)\n\nFix #13626",
          "timestamp": "2025-04-16T18:00:31Z",
          "tree_id": "deff475860a9797291468cfb79f8dac7115500ad",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/70c58ab773c7e8e2ed2bcc4eb7acbeec31477200"
        },
        "date": 1744830382307,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9490,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.25497669895436603,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 140365,
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
          "id": "caac1c911722c6ec43cba85cf2b6786a247bfc52",
          "message": "refactor(avm): move interaction jobs to trace builders (#13621)\n\nNext step is to make the tests use these, so that we are sure we are\ntesting the way we generate lookups in prod.\n\nHowever this is not trivial because sometimes we want to use subsets, or\nwe want to expect failures when running particular subsets. Will think\nmore about how to do this. I have some ideas.",
          "timestamp": "2025-04-16T17:35:10Z",
          "tree_id": "fce066832067441f1db3bba56014f46fc872ae9d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/caac1c911722c6ec43cba85cf2b6786a247bfc52"
        },
        "date": 1744830386277,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9480,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.25471892276310937,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 142653,
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
          "id": "f02123d95d6a84460b6535312f4d1de52e8e1e19",
          "message": "feat: SMT verification module updates (#13551)\n\nThis pr mostly consists of code refactoring/renames \n\n## Cmake\n\n`cvc5` build is now multi-threaded\n\n## Circuit Builders\n\n`CircuitBuilderBase` - added `circuit_finalized` into msgpack schema\n`UltraCircuitBuilder` - zero is now force renamed during circuit export\n\n## smt_subcircuits\n\nswitched `0xabbba` to `0` since it produced failures duirng circuit\ncreations\n\n## Solver\n\n- Added new method `get` and `operator[]`. These two methods extract the\nvalue of the variable from solver. Added a test\n- fixed the incorrectly placed `BITVECTOR_UDIV`\n- renamed `getValue` to `get_symbolic_value` to avoid confusion\n\n## Terms\n\n- New constructor, based on `bb::fr` value\n- Got rid of `isFiniteField` like members. Useless\n- Added `normalize` method, for more readability\n- Refactored the operators\n\n## SMT_Util\n\n- add `is_signed` flag in `string_to_fr()` to avoid overflows \n\n## Tests\n\nFor most part it's either a rename, engine switch or new `operator[]`\nrefactoring\n\nAlso \n- fixed an incorrect `extract_bit` test\n- \n\nAll the current changes are reflected in `README.md`\n\n---------\n\nCo-authored-by: Innokentii Sennovskii <isennovskiy@gmail.com>",
          "timestamp": "2025-04-16T19:05:39Z",
          "tree_id": "ed81b35b21e04f83e64049ed57e98b3ed1ca8ac9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f02123d95d6a84460b6535312f4d1de52e8e1e19"
        },
        "date": 1744835242718,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9963,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26771038020228194,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 153031,
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
          "id": "f709fab13118d12b85c7b1efd724b1876b9ed520",
          "message": "feat(p2p): optional P2P_BROADCAST_PORT (#13525)\n\nfixes: https://github.com/AztecProtocol/aztec-packages/issues/13165",
          "timestamp": "2025-04-16T19:57:48Z",
          "tree_id": "9209901346aa4f083454c46bb7a5ad010e190931",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f709fab13118d12b85c7b1efd724b1876b9ed520"
        },
        "date": 1744836750206,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9711,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2609215907136962,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 150587,
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
          "id": "abbad4c54fa4ec300dfc8fa0ea6b407979fdd247",
          "message": "chore: Use chain monitor to sync system time in p2p tests (#13632)\n\nInstead of sending a tx and awaiting its receipt, we monitor for new l1\nblocks and update time then.\n\nShould fix a [flake in p2p\ntests](http://ci.aztec-labs.com/e0ca323545d90e02) where\n`syncMockSystemTime` was called twice simultaneously and caused two txs\nfrom the same address to be sent at the same time, leading to a nonce\nclash:\n\n```\n19:30:55     FormattedViemError: Nonce provided for the transaction is lower than the current nonce of the account.\n19:30:55     Try increasing the nonce or find the latest nonce with `getTransactionCount`.\n19:30:55\n19:30:55     Request Arguments:\n19:30:55       from: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\n19:30:55       to: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\n19:30:55       value:                 0.000000000000000001 ETH\n19:30:55       data: 0x\n19:30:55       gas:                   25201\n19:30:55       maxFeePerGas:          1.365169136 gwei\n19:30:55       maxPriorityFeePerGas:  1.2 gwei\n19:30:55\n19:30:55     Details: transaction already imported\n19:30:55     Version: viem@2.23.7\n19:30:55\n19:30:55       298 |         }\n19:30:55       299 |     }\n19:30:55     > 300 |     return new FormattedViemError(formattedRes.replace(/\\\\n/g, '\\n'), error?.metaMessages);\n19:30:55           |            ^\n19:30:55       301 | }\n19:30:55       302 | export function tryGetCustomErrorName(err) {\n19:30:55       303 |     try {\n19:30:55\n19:30:55       at formatViemError (../../ethereum/dest/utils.js:300:12)\n19:30:55       at L1TxUtilsWithBlobs.sendTransaction (../../ethereum/dest/l1_tx_utils.js:177:31)\n19:30:55       at L1TxUtilsWithBlobs.sendAndMonitorTransaction (../../ethereum/dest/l1_tx_utils.js:326:48)\n19:30:55       at P2PNetworkTest.syncMockSystemTime (e2e_p2p/p2p_network.ts:163:25)\n19:30:55       at e2e_p2p/reex.test.ts:219:9\n```",
          "timestamp": "2025-04-16T20:54:21Z",
          "tree_id": "d5acec0beb696138bfa86cda4f1f47c079f21e4e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/abbad4c54fa4ec300dfc8fa0ea6b407979fdd247"
        },
        "date": 1744840062074,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9939,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26704530129786685,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 154131,
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
          "id": "da1e6986d7f59b49739a42aba07718b75f39e6cb",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"24b9f372b4\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"24b9f372b4\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-17T02:30:31Z",
          "tree_id": "df48f992689bd71532eac9290ea97a0cf8522f70",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/da1e6986d7f59b49739a42aba07718b75f39e6cb"
        },
        "date": 1744859082706,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10481,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.28160518333764656,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 165103,
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
          "id": "489c6cf66bdf9eaba7e1c98d9e2004fe703b22cc",
          "message": "feat: track rewards and slots (#13546)\n\nThis PR adds metrics to track rewards for sequencers/provers and slots\nfor sequencers.",
          "timestamp": "2025-04-17T11:18:15Z",
          "tree_id": "2ba9cf4d0ee50f07dca264ce6f95b4090235e78a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/489c6cf66bdf9eaba7e1c98d9e2004fe703b22cc"
        },
        "date": 1744891835627,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10191,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2738257871053794,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 162367,
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
          "id": "53c070d3954b927a2718f32f4823dc51d8764bda",
          "message": "fix: make translator use ultra rather than eccvm ops (#13489)\n\nWhile attempting to implement the consistency check between the Merge\nand Translator Verifier I realised that the TranslatorCircuitBuilder is\nconstructed using the VMops, redundantly converted to UltraOps. This PR\naddressed the issue and attempts a small cleanup on the\n`UltraEccOpsTable`.\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1266",
          "timestamp": "2025-04-17T14:34:14Z",
          "tree_id": "5382cecaf1f714013616d2c47bbc18a23b497754",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/53c070d3954b927a2718f32f4823dc51d8764bda"
        },
        "date": 1744903759848,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9706,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2608001243494993,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 145365,
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
          "id": "9d941b6b55e03d2f5ad96b00fd488a71e6082f3f",
          "message": "fix(avm): cpp addressing (#13652)\n\nfix(avm): cpp addressing\n\ntesting for addressing",
          "timestamp": "2025-04-17T15:00:08Z",
          "tree_id": "94bb248508c49d688c6ebec36bbc37a320590322",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9d941b6b55e03d2f5ad96b00fd488a71e6082f3f"
        },
        "date": 1744906514101,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10089,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2710760989221743,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 159782,
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
          "id": "58c143b4fcdbd323fad178549c27042815ce4de0",
          "message": "fix: discv5 test failure (#13653)\n\n## Overview\n\nBase config was being passed to the bootstrap node by reference, which\nwas overriding the p2pbroadcast port on start up, which meant the port\nwas not being updated in the test.\n\nI didnt experience this in the broadcast pr as i ran the tests\nindividually\n\n----------\nalso renaming getAllPeers to getKadValues as private peers can be peers\nbut not in the kad, so the name no longer fits after the private peers\npr",
          "timestamp": "2025-04-17T16:35:08Z",
          "tree_id": "e8ba6bd78a0e9c2633e73f2c62a72a8518cb51ae",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/58c143b4fcdbd323fad178549c27042815ce4de0"
        },
        "date": 1744912264241,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10403,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.27951933854543726,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 169860,
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
          "id": "66a61bad67f2c007b63b0cf060f8d65ef6900ae9",
          "message": "feat: no longer recompute vk's in CIVC proofs (#13590)\n\nApologies for the big PR. Lots of the stuff in here ended up being\nchicken and egg with wanting to do refactoring to make this process\nsmoother/help debug tricky issues, and wanting to see that those\nrefactorings actually make sense by the end.\n\nWe no longer compute VKs on the fly in CIVC. This saves ~25% of\ncomputation. This is done throughout by consolidating IVC inputs into a\nsingle ivc-inputs.msgpack structure which supports passing bytecode,\nwitness & vk information to the bb backend. Now attaches a name for each\nfunction, as well.\n\nMajor features:\n- IVC inputs passed thru native and wasm are always passed a single\nfile/buffer. This is encoded using msgpack and capture bytecode,\nwitness, vk, and function name (which is now printed, but only properly\npassed by native) For native, the bincode and witnesses are gzipped, for\nWASM they are uncompressed. For actions such as gates or write_vk, the\nIVC inputs are used with same structure but witness and vk data can be\nblank.\n\nThis has a bunch of implications, such as having to break away from the\nrigid API base class in bb cli (which overall doesn't feel worthwhile\nanyway as CIVC is fundamentally different than UH), having to string vk\ninfo along, etc.\n\nOther features:\n\nDebuggability:\n\n- Correct README.md instructions on WASM stack traces (give up on\ngetting line numbers working :/)\n- clangd now properly shows all errors in a C++ file you're browsing,\ninstead of only showing you the first error.\n\nCleanup\n\n- small cleanup to acir tests, but still not testing new ivc flow there.\nLightest weight test is ivc-integration in yarn-project\n- Get rid of --input_type in bb cli for CIVC. now implied always to be\nwhat was previously runtime_stack. Simplifies usages, other modes were\nunused.\n- more ignored linting in the clangd file. Maybe one day we can enforce\nthe remaining as errors.\n- Clean up msgpack usage. Msgpack headers were leaking everywhere and it\nis a chunky library.\n- Consolidate with using msgpackr as our only typescript messagepack\nlibrary\n\nBenches\n\n- use wasmtime helper in bb bootstrap. deduplicate code in bench. bench\nnow honours NATIVE_PRESET, and if you do\n```\nexport NATIVE_PRESET=op-count-time\n./bootstrap.sh\n./bootstrap.sh bench\n```\nyou will get op count timings for our native ivc benches.\n\n---------\n\nCo-authored-by: Copilot <175728472+Copilot@users.noreply.github.com>\nCo-authored-by: thunkar <gregojquiros@gmail.com>\nCo-authored-by: maramihali <mara@aztecprotocol.com>\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>",
          "timestamp": "2025-04-17T16:39:33-04:00",
          "tree_id": "cceae41613bb981b8388ac35e8cd4c337641854c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/66a61bad67f2c007b63b0cf060f8d65ef6900ae9"
        },
        "date": 1744923650998,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9727,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2613609009842067,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 142208,
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
          "id": "71e81ce464627f733f5671341bd36e074071ded2",
          "message": "feat: VK generation test for HonkRecursionConstraint (#13637)\n\nAdds a new test that checks whether the HonkRecursionConstraint circuit\nis the same with valid inputs vs with dummy inputs.",
          "timestamp": "2025-04-17T19:20:04Z",
          "tree_id": "2eb786c277a2177f8f170b9fdf1feaa5d6775c4a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/71e81ce464627f733f5671341bd36e074071ded2"
        },
        "date": 1744925719655,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9907,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2661929142640538,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 160234,
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
          "id": "c8acae09dece27addbdce266be703a487be4d862",
          "message": "chore: delete zeromorph (#13667)\n\nWe're not going to use Zeromorph. The time has come to let it go.",
          "timestamp": "2025-04-17T23:35:07Z",
          "tree_id": "473722d9397f4fc995b3caaf47ceb4b64eebcf5c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c8acae09dece27addbdce266be703a487be4d862"
        },
        "date": 1744937524853,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10143,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.272545955336259,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 144740,
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
          "id": "ae578a28d7b50bf7a388af58e3cd24c90dbf315c",
          "message": "chore: delete Ultra Vanilla CIVC (#13669)\n\nThis was an experimental class introduced by Cody for doing \"vanilla\" UH\nrecursion with an interface similar to CIVC. Aside from the fact that we\nhave no need for something like this, it has no hope of being useful\nbecause it relies on the mechanism of appending recursive verifiers to\ninput circuits, similar to our original design for CIVC. This isn't\nsound because there's no way for the verifier to know that the recursive\nverifications were performed. This is precisely why Aztec has kernel\ncircuits which are specifically designed to perform recursion and are\nfixed by the protocol.",
          "timestamp": "2025-04-17T23:52:35Z",
          "tree_id": "2650a4cc2dda03eee53e7dd543888d0ad4f190ed",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ae578a28d7b50bf7a388af58e3cd24c90dbf315c"
        },
        "date": 1744938458152,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9847,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26457462221389694,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 148896,
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
          "id": "ac95729957e0ff9da11d18c38c379790545db154",
          "message": "chore: delete honk_recursion for building ACIR (#13664)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1013 in the\ncontext for building ACIR.\n\nWhen we updated verify_proof_with_type to no longer default to plonk\nproofs, we forgot to also delete some hacky code wrt using the\nhonk_recursion flag for figuring out which recursive verifier to use.\nSince we always receive the proof type through the actual constraint,\nthere's no need to use the honk_recursion flag to pick this out, so it\ncan be completely removed for this context.",
          "timestamp": "2025-04-18T00:28:05Z",
          "tree_id": "92fcf62505cd9d569001e169175debadebcda1f7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ac95729957e0ff9da11d18c38c379790545db154"
        },
        "date": 1744942650057,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9450,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.25390576896758615,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 140853,
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
          "id": "017b00c0af3b1dc24edba931f7a3954e0c1df962",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"cbd6906369\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"cbd6906369\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-18T02:29:36Z",
          "tree_id": "b29387310112df4907b643d1d78c73233437d243",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/017b00c0af3b1dc24edba931f7a3954e0c1df962"
        },
        "date": 1744945388690,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9982,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2682035085310172,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 149778,
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
          "id": "ff29d8668fcad9001f701144918346849174fea1",
          "message": "chore: remove msm sorter (#13668)\n\nThe `MsmSorter` class contained logic to sort the inputs to an MSM\n{scalars, points} by scalar, sum the points sharing a scalar, then\nperform the MSM on the reduced result. This was motivated by the need to\ncommit to z_perm in the structured setting where the coefficients are\nconstant over large ranges. Turns out though that since our polys have a\nwell defined structure, its much better to simply provide the constant\nranges explicitly rather than sorting then adding. Much of the logic of\nthis class was repurposed into `BatchedAffineAddition` which is what\nsupports our `commit_structured_with_nonzero_complement` method (used\nfor `z_perm`).",
          "timestamp": "2025-04-18T03:30:02Z",
          "tree_id": "4a8c32ee1582651f4cbb043e49320477688d01b8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ff29d8668fcad9001f701144918346849174fea1"
        },
        "date": 1744950248297,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9860,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2649227683899451,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 150516,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "96737978+feltroidprime@users.noreply.github.com",
            "name": "feltroid Prime",
            "username": "feltroidprime"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "6bc34a1089ccd507f61fa10c6fbd4cbcbe0cfda6",
          "message": "feat: Garaga UltraStarknet[Zk]Honk flavours (#11489)\n\nAdds a `ultra_starknet_flavour` and `ultra_starknet_zk_flavour`, forked\nfrom the ultra_keccak_(zk)_flavour.\n\n\nThis was tested with bb 0.82.2 with a reference corresponding\nimplementation of the transcript in python similar to the keccak one.\n\n\nSee generic proof -> Transcript implementation\nhttps://github.com/keep-starknet-strange/garaga/blob/f5921e0f7e69f474ee0a88b6ecfb52252fc7cc3d/hydra/garaga/precompiled_circuits/honk.py#L526\n\n\nhttps://github.com/keep-starknet-strange/garaga/blob/f5921e0f7e69f474ee0a88b6ecfb52252fc7cc3d/hydra/garaga/precompiled_circuits/honk.py#L448-L501\n\n\n~The Starknet poseidon hash was imported from the reference\nimplementation from CryptoExperts (used in production in Starkware STONE\nprover) https://github.com/CryptoExperts/poseidon~\n\nStarknet field is defined using existing templates and poseidon\nimplementation re-uses Sponge from poseidon2\n\n---------\n\nCo-authored-by: Rodrigo Ferreira <rodrigo.ferreira@aya.yale.edu>\nCo-authored-by: raugfer <admin@raugfer.com>\nCo-authored-by: ludamad <adam.domurad@gmail.com>\nCo-authored-by: ludamad <domuradical@gmail.com>",
          "timestamp": "2025-04-18T06:12:55Z",
          "tree_id": "95303ddf1d6833cd25072ba78e11fb41633518c7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6bc34a1089ccd507f61fa10c6fbd4cbcbe0cfda6"
        },
        "date": 1744961541405,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9755,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26212202986251437,
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
          "id": "8e2a3c975d555017ff1a9bd7cc0f6bebfe586ebd",
          "message": "fix(p2p): reqresp types + batch request tx pool filtering (#13666)\n\n## Overview\n\nIncorrect typing in the reqresp module lead undefined results to NOT be\nfiltered when being added to the tx pool",
          "timestamp": "2025-04-18T10:08:22Z",
          "tree_id": "1705737318847bbc01162306b2e25d3490647f05",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8e2a3c975d555017ff1a9bd7cc0f6bebfe586ebd"
        },
        "date": 1744974074022,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9652,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.25933697390577304,
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
          "id": "90c2b7bcbb5c90dbde5bd0798d6359500ae73109",
          "message": "chore: stop prover node swallowing start prover job errors (#13676)",
          "timestamp": "2025-04-18T19:25:08Z",
          "tree_id": "d22b31637ba5b65d7f32020f94c848280fca4b73",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/90c2b7bcbb5c90dbde5bd0798d6359500ae73109"
        },
        "date": 1745008224052,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9725,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26129124384299846,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 140573,
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
          "id": "062c6a9a52d08c7c509d8693ba155dd0cca12571",
          "message": "feat(avm): quick n dirty memory trace (#13659)\n\nI wanted to start generating rows for memory.\n\nI'm still not sure of the interactions between mem and range checks but\nthere will be some so the setup makes sense.",
          "timestamp": "2025-04-18T20:05:30Z",
          "tree_id": "cd561628ac26c8d6d0fdf5cdc3d6dbb52621fe28",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/062c6a9a52d08c7c509d8693ba155dd0cca12571"
        },
        "date": 1745011678629,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10242,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.275200070451218,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 167285,
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
          "distinct": true,
          "id": "e00089f03faeee33524134207a88e231906a0ccf",
          "message": "fix: dependency cycles in public simulator - part 0 (sim -> context) (#13678)\n\nBrings cycles down from 66 to 19.\n\n\n![image](https://github.com/user-attachments/assets/85cc7057-d66d-4396-9750-021ce3d2fc80)\n\nCo-authored-by: dbanks12 <david@aztecprotocol.com>",
          "timestamp": "2025-04-18T20:42:59Z",
          "tree_id": "4228843718ae8437d0602e74a2aab944272c9411",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e00089f03faeee33524134207a88e231906a0ccf"
        },
        "date": 1745012860452,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9794,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2631545706791072,
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
          "id": "90033f2d5e05966af0dd29179762d3f38e9154b5",
          "message": "feat(contracts): static + snapshotted validator set (#13046)\n\nfixes: https://github.com/AztecProtocol/aztec-packages/issues/8761\n\nThis version stores a history of the validator set, without changing any\nof the apis. Follow up will include commitments to the committee\n\nThis Pr adds a SnappshottedAddressLib that ensures the validator set\nsize and members cannot change during an epoch.\n\nIn its current form, calculations that rely on attesters.size can be\nincorrect as it's size can change during the life time of an epoch. This\ncode snapshots the validator set such that queries to the attestor set\nwill remain fixed during the current epoch, and changes to the set will\nonly occur over the epoch boundary.",
          "timestamp": "2025-04-18T21:32:04Z",
          "tree_id": "297c460f17f2953f9fbe6b3ad2d2091ba236bd33",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/90033f2d5e05966af0dd29179762d3f38e9154b5"
        },
        "date": 1745015787774,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9655,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.25941205295845177,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 147381,
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
          "id": "f8c0ba87a998418815a44f517e2065ce0bb038d5",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"1719f87f0a\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"1719f87f0a\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-19T02:28:05Z",
          "tree_id": "3957dcacbc68b882db4b84b70dffa0c08cfb013d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f8c0ba87a998418815a44f517e2065ce0bb038d5"
        },
        "date": 1745031646117,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9511,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2555668856874877,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 137392,
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
          "id": "76cab3fbe46226a66ec969d9a2a5348e1056e68b",
          "message": "fix: retry deploy npm (#13691)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-04-19T14:38:56Z",
          "tree_id": "194b963dac2d67503cc46f6c23422cb81538109e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/76cab3fbe46226a66ec969d9a2a5348e1056e68b"
        },
        "date": 1745077113095,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9882,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26551969240074674,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 153381,
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
          "distinct": true,
          "id": "c75e3652343db4b62fac08d9ac76a8bf1ea6943e",
          "message": "fix: dependency cycles in public simulator - part 1 (errors/revertReason) (#13679)\n\nBrings cycles down from 19 to 15 \n\n![image](https://github.com/user-attachments/assets/0321e7e9-3a60-42d9-82ed-1f6cb9f3b307)\n\nCo-authored-by: dbanks12 <david@aztecprotocol.com>",
          "timestamp": "2025-04-19T16:53:01Z",
          "tree_id": "c2bfadeab532664a6ee3e3c02d7615ec82512af1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c75e3652343db4b62fac08d9ac76a8bf1ea6943e"
        },
        "date": 1745084688952,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9858,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2648834009757245,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 148721,
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
          "id": "062d8dbc0596985734b36161e5175b37f8dadd8d",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"cfe9fadad1\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"cfe9fadad1\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-20T02:31:57Z",
          "tree_id": "34d9877f936a2adfa8870c493dd2af22959aae71",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/062d8dbc0596985734b36161e5175b37f8dadd8d"
        },
        "date": 1745118373604,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9934,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2669267601017098,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 158796,
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
      }
    ]
  }
}