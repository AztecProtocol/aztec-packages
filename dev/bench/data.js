window.BENCHMARK_DATA = {
  "lastUpdate": 1744634269151,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "C++ Benchmark": [
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
          "id": "1994b2ccb3976644074beabeddf708427a2b6700",
          "message": "chore(avm): dont use PIs in simulation (#13409)\n\nWe would not have PIs in standalone simulation. We have to make sure\nthat our inputs either come from the DBs or TX.",
          "timestamp": "2025-04-09T13:22:44Z",
          "tree_id": "8075083f52d03f05c9ca572f055a409bd82f8b35",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1994b2ccb3976644074beabeddf708427a2b6700"
        },
        "date": 1744208667125,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20938.89579400002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16001.893899000002 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 123987785396.6,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 2225071798,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 295879534,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19891.86316600012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16859.932721000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56876.65696099999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56876661000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4100.1088630000595,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3459.585764000001 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12029.898798,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12029902000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2337.56",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "1994b2ccb3976644074beabeddf708427a2b6700",
          "message": "chore(avm): dont use PIs in simulation (#13409)\n\nWe would not have PIs in standalone simulation. We have to make sure\nthat our inputs either come from the DBs or TX.",
          "timestamp": "2025-04-09T13:22:44Z",
          "tree_id": "8075083f52d03f05c9ca572f055a409bd82f8b35",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1994b2ccb3976644074beabeddf708427a2b6700"
        },
        "date": 1744208676593,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30122,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17891,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9128,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10879,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12780,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "4247bb6512d9e5b7e9515ac52eaeaf9f5251eb34",
          "message": "feat: persist the bot and enable simulation capturing (#13276)\n\nThe bots did not persist their databases because when we first\nintroduced them the pxe did not have reorg support. This should be fine\nnow :)\n\nAlso enables the option of using the recording simulator in the bot's\nPXE for debugging",
          "timestamp": "2025-04-09T14:51:32Z",
          "tree_id": "e8e5db9c1980eebfd7752bd481f67a411fc5f613",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4247bb6512d9e5b7e9515ac52eaeaf9f5251eb34"
        },
        "date": 1744212441133,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29858,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18225,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9311,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 11048,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12735,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "8dc17ec36e2723958d297b7847af1ec94ff57561",
          "message": "feat: more blob sink metrics (#13413)\n\nThis PR adds more metrics to the blob sink\n\n---------\n\nCo-authored-by: Santiago Palladino <santiago@aztecprotocol.com>",
          "timestamp": "2025-04-09T15:18:10Z",
          "tree_id": "95a2e8af434b94c546de17d6bf355ad1979a0696",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8dc17ec36e2723958d297b7847af1ec94ff57561"
        },
        "date": 1744214040255,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29906,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18118,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9429,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 11146,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12834,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "ff2e7381d344dbfa18be8deff96c61b01e53d6f4",
          "message": "fix: Nondeterminism in constant allocation (#13340)\n\nQuick fix to an issue discovered in testnet. We were having\nnondeterministic contract builds between aarch64 and amd64 builds of the\nnoir compiler, reproduced locally. The iterators generated from the\nFxHashMaps/FxHashSets used in constant_allocation were yielding\ndifferently ordered items. I did log the insertions and the input was in\nthe same order (if the insertion ordering was nondeterministic the\niteration order is expected to be nondeterministic) so I have no idea\nwhat was creating the nondeterminism there. Switched to a\nBTreeMap/BTreeSet in that file and nondeterminism is gone.",
          "timestamp": "2025-04-09T15:22:43Z",
          "tree_id": "1efcb1efecf60c9a6966f88f74de166abb69c434",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ff2e7381d344dbfa18be8deff96c61b01e53d6f4"
        },
        "date": 1744214945827,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30046,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18167,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9233,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10919,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12713,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "33286aeea54ac77a4dc1dd82fba1c63a7c463803",
          "message": "fix: easier description of how to use multiple authwitnesses with cli wallet (#13412)\n\nWas unable to figure out how it worked here from the desc to use\nmultiple authwits in a single tx, so I made it a bit easier to figure\nout and added it in the desc",
          "timestamp": "2025-04-09T15:45:28Z",
          "tree_id": "8e55da863a814017f52e387bfb426cc652e407cb",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/33286aeea54ac77a4dc1dd82fba1c63a7c463803"
        },
        "date": 1744216445228,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30454,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18040,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9149,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10886,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12822,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "593541723bd2350745cc40f15b969016e5cf65ba",
          "message": "fix: Use API keys when fetching blobs on missed slot (#13418)\n\nOptional arguments considered harmful.\n\nDue to a missed argument in a recursive call, we were not loading the\nAPI keys for hitting the consensus URL on a missed slot, so any requests\nwould fail with a 4xx if hitting a consensus endpoint that needed keys\n(like GCP's).\n\nFixes #13415",
          "timestamp": "2025-04-09T15:56:15Z",
          "tree_id": "1e4f9136c6fb69525de06f98c47681e01740887c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/593541723bd2350745cc40f15b969016e5cf65ba"
        },
        "date": 1744220573351,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29869,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17868,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9189,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10987,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12695,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "ea7eaf5919e84b7abb75cb90839ed22b516c71ad",
          "message": "refactor(avm): getNullifierIndex -> checkNullifierExists (#13414)\n\nChanging only for public, the same can be done for private.\n\nChatted with @nventuro and decided to merge the CommitmentsDB interface\nwith the ExecutionDataProvider interface, since it wasn't used anywhere\nelse.",
          "timestamp": "2025-04-09T16:12:37Z",
          "tree_id": "898c6d70e3376d1a044ca40fd0626415e5fe813c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ea7eaf5919e84b7abb75cb90839ed22b516c71ad"
        },
        "date": 1744220632031,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30124,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17914,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9229,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10912,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12858,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "ca81e65fe32e295cc48596fff1b0fd1a6df5f1c3",
          "message": "fix: warn if blob sink server can't be reached (#13419)",
          "timestamp": "2025-04-09T16:58:58Z",
          "tree_id": "a4ac5c5c094b65cf401f081d9e6f654a23687185",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ca81e65fe32e295cc48596fff1b0fd1a6df5f1c3"
        },
        "date": 1744220722710,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30003,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18064,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9195,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10857,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12881,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": false,
          "id": "15d2633d5bb6de55d74f4b8404cd4f009523f708",
          "message": "fix(Barretenberg): shplemini variables in one gate fixes (#13290)\n\nThis PR fixes extra and unconstrained variables in the ultra recursive\nverifier.\n\nExtra variables appeared in the circuit for different reasons. We don't\nfix some places in the circuit because of interleaving (see\nhttps://github.com/AztecProtocol/barretenberg/issues/1293)\n\nAlso static analyzer found unconstrained variables in the circuit:\nnum_public_inputs and pub_inputs_offset were added in the circuit at the\ntime of the creation of verification key.\n\nAlso there was created function to print additional information about\nvariable in one gate for more convenient debugging.\n\n---------\n\nCo-authored-by: iakovenkos <sergey.s.yakovenko@gmail.com>",
          "timestamp": "2025-04-09T17:00:36Z",
          "tree_id": "930505a65bb045ea4588dc576d310da8532e27e5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/15d2633d5bb6de55d74f4b8404cd4f009523f708"
        },
        "date": 1744220872971,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20953.73451500018,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15436.526381 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 123294783048.7,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 2143547924,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 289936740,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19971.887428000173,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16749.220315000002 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56932.983545,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56932987000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4071.3171510001303,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3442.662881 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11968.280734,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11968285000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2233.56",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "distinct": false,
          "id": "15d2633d5bb6de55d74f4b8404cd4f009523f708",
          "message": "fix(Barretenberg): shplemini variables in one gate fixes (#13290)\n\nThis PR fixes extra and unconstrained variables in the ultra recursive\nverifier.\n\nExtra variables appeared in the circuit for different reasons. We don't\nfix some places in the circuit because of interleaving (see\nhttps://github.com/AztecProtocol/barretenberg/issues/1293)\n\nAlso static analyzer found unconstrained variables in the circuit:\nnum_public_inputs and pub_inputs_offset were added in the circuit at the\ntime of the creation of verification key.\n\nAlso there was created function to print additional information about\nvariable in one gate for more convenient debugging.\n\n---------\n\nCo-authored-by: iakovenkos <sergey.s.yakovenko@gmail.com>",
          "timestamp": "2025-04-09T17:00:36Z",
          "tree_id": "930505a65bb045ea4588dc576d310da8532e27e5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/15d2633d5bb6de55d74f4b8404cd4f009523f708"
        },
        "date": 1744220883089,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30006,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17985,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9210,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10843,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12733,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "6c23db4ddba5aed447ee44412ce96b3a637c6a7e",
          "message": "chore: bump to forge nightly 2025-04-08 (#12799)\n\nWe want to move to stable forge.\nFix #12742\n\n---------\n\nCo-authored-by: Charlie Lye <5764343+charlielye@users.noreply.github.com>\nCo-authored-by: Santiago Palladino <santiago@aztec-labs.com>",
          "timestamp": "2025-04-09T21:56:56Z",
          "tree_id": "830df1d995d4e366e33fa2f5196ccc570ad6b38c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6c23db4ddba5aed447ee44412ce96b3a637c6a7e"
        },
        "date": 1744239293973,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20864.131946000045,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15548.228433 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 123256171399.1,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 2143053115,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 292063267,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19893.73541100008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16652.634495000002 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56587.494153,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56587497000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4038.2790260000547,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3496.989058 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12094.923454,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12094926000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2249.56",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "6c23db4ddba5aed447ee44412ce96b3a637c6a7e",
          "message": "chore: bump to forge nightly 2025-04-08 (#12799)\n\nWe want to move to stable forge.\nFix #12742\n\n---------\n\nCo-authored-by: Charlie Lye <5764343+charlielye@users.noreply.github.com>\nCo-authored-by: Santiago Palladino <santiago@aztec-labs.com>",
          "timestamp": "2025-04-09T21:56:56Z",
          "tree_id": "830df1d995d4e366e33fa2f5196ccc570ad6b38c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6c23db4ddba5aed447ee44412ce96b3a637c6a7e"
        },
        "date": 1744239304725,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29973,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18147,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9219,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10899,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12740,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "866968a79be21d4d64442326bf4e91e2bd05eb69",
          "message": "chore: BoundedVec::for_each (#13426)\n\nNow that this exists in the stdlib we can get rid of our homemade\nreplacement function.",
          "timestamp": "2025-04-09T22:34:43Z",
          "tree_id": "a6ff7604bc9b79d5132d0dab7550cd368cb02f91",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/866968a79be21d4d64442326bf4e91e2bd05eb69"
        },
        "date": 1744241513699,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30052,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17921,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9374,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10954,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12803,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "772259aa081e102ff0b4b57f68019c275afbb93b",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"b32f8e9b47\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"b32f8e9b47\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-10T02:29:58Z",
          "tree_id": "365a83b2865540b221eba17e34a4d4b7c26c661e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/772259aa081e102ff0b4b57f68019c275afbb93b"
        },
        "date": 1744254187934,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30254,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18096,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9235,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10892,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12856,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "9eadf18b6e9757a16d1bd2d464c5a539256b7a7d",
          "message": "chore(avm): check full tuple after find_in_dst (#13397)\n\nCloses #13140, assuming tests are compiled with assertions enabled.",
          "timestamp": "2025-04-10T07:07:22Z",
          "tree_id": "95ffdd0d048c89685edd60dc8b40222074c2408f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9eadf18b6e9757a16d1bd2d464c5a539256b7a7d"
        },
        "date": 1744273567746,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20938.744746999873,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15847.255911999999 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 123260278920.09999,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 2125179674,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 293068206,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19878.05980799976,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16959.319844999998 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56826.333324,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56826338000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4145.778457999768,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3453.587455 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11969.208045,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11969211000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2249.56",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "9eadf18b6e9757a16d1bd2d464c5a539256b7a7d",
          "message": "chore(avm): check full tuple after find_in_dst (#13397)\n\nCloses #13140, assuming tests are compiled with assertions enabled.",
          "timestamp": "2025-04-10T07:07:22Z",
          "tree_id": "95ffdd0d048c89685edd60dc8b40222074c2408f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9eadf18b6e9757a16d1bd2d464c5a539256b7a7d"
        },
        "date": 1744273581722,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30526,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18015,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9215,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10880,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12844,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "ac97b246604b9df6e7691c559a01d395a045050d",
          "message": "feat: Add nullifier read gadget (#13403)\n\nAdds a nullifier read gadget that will eventually be transformed to a\nnullifier rw gadget",
          "timestamp": "2025-04-10T07:39:09Z",
          "tree_id": "5a563efefcb94a579155358e0b3ac4bab89c048d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ac97b246604b9df6e7691c559a01d395a045050d"
        },
        "date": 1744275520407,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 21101.6842920003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15554.241216999999 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 123290446008.6,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 2160199554,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 279435666,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19978.16438899963,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16961.066931999998 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 57034.192459,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 57034194000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4091.656533999412,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3477.519465 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12032.710421,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12032710000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2249.56",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "ac97b246604b9df6e7691c559a01d395a045050d",
          "message": "feat: Add nullifier read gadget (#13403)\n\nAdds a nullifier read gadget that will eventually be transformed to a\nnullifier rw gadget",
          "timestamp": "2025-04-10T07:39:09Z",
          "tree_id": "5a563efefcb94a579155358e0b3ac4bab89c048d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ac97b246604b9df6e7691c559a01d395a045050d"
        },
        "date": 1744275530265,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30097,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18001,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9246,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10906,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12862,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "220e82b278055d254de689e7cab343f51290a956",
          "message": "fix: omit p2p options from prover & bootstrap nodes (#13441)\n\nWe were getting options like `p2pPort` in multiple namespaces & getting\nthem overwriten. we should only get p2p CLI options under the `p2p.`\nnamespace and apply those to whatever infra is starting",
          "timestamp": "2025-04-10T12:40:43Z",
          "tree_id": "f4d5d9c62d04756ccd317b5307db0e1f52023756",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/220e82b278055d254de689e7cab343f51290a956"
        },
        "date": 1744292367472,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30407,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17875,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9245,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10978,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12908,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "915841b28fcba381467b2bb55e082fd91fb22d27",
          "message": "fix: deprecate witness circuit size from ECCVM and Translator (#13133)\n\nThe circuit sizes in Translator and ECCVM are now given by constexpr\nintegers. Therefore, the provers do not need to send the circuit sizes\nto the verifiers. In its turn, the respective recursive verifiers do not\nneed to constrain witness `log_circuit_size`s in-circuit.\n\nTo support this change, I modified Shplemini interface to accept log\ncircuit size as an integer as opposed to (unconstrained) witness\n`circuit_size`. The derivation of log circuit sizes in other Flavors'\nrecursive verifiers is still insecure.\n\nIntroduced `USE_PADDING` flag in Flavors to allow compile time exclusion\nof padding logic in Shplemini and Sumcheck.\n \n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1040",
          "timestamp": "2025-04-10T15:37:21Z",
          "tree_id": "5850f444477e53e31be896d552284a1c5f3bdad9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/915841b28fcba381467b2bb55e082fd91fb22d27"
        },
        "date": 1744307652002,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20820.42982699977,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15883.225595999998 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 123255534619.40001,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 2146031306,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 291641696,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19850.112371999785,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16698.030454 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56377.41949,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56377421000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4095.7456900005127,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3547.551595 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11977.940816,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11977946000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2249.56",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "915841b28fcba381467b2bb55e082fd91fb22d27",
          "message": "fix: deprecate witness circuit size from ECCVM and Translator (#13133)\n\nThe circuit sizes in Translator and ECCVM are now given by constexpr\nintegers. Therefore, the provers do not need to send the circuit sizes\nto the verifiers. In its turn, the respective recursive verifiers do not\nneed to constrain witness `log_circuit_size`s in-circuit.\n\nTo support this change, I modified Shplemini interface to accept log\ncircuit size as an integer as opposed to (unconstrained) witness\n`circuit_size`. The derivation of log circuit sizes in other Flavors'\nrecursive verifiers is still insecure.\n\nIntroduced `USE_PADDING` flag in Flavors to allow compile time exclusion\nof padding logic in Shplemini and Sumcheck.\n \n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1040",
          "timestamp": "2025-04-10T15:37:21Z",
          "tree_id": "5850f444477e53e31be896d552284a1c5f3bdad9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/915841b28fcba381467b2bb55e082fd91fb22d27"
        },
        "date": 1744307661759,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29820,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17957,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9267,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10854,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12772,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "148ff8d9011739dd03a7865ca46cb5f5301ca4e7",
          "message": "chore: update koa dependency (#13452)\n\n## Overview\n\nupdate koa dependency",
          "timestamp": "2025-04-10T17:53:50Z",
          "tree_id": "e4abc6761a4f3ce5c3f7df6836c258050780b237",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/148ff8d9011739dd03a7865ca46cb5f5301ca4e7"
        },
        "date": 1744311337019,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29986,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17961,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9237,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10921,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12774,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "507b68be913746f6d1e05172010e5f4d03ee8bf5",
          "message": "feat: statically defined ECCVM/Translator VK data (#13395)\n\nIntroduces static methods for initializing the verification keys for\nECCVM/Translator. This is possible since the VK commitments for these\nVMs are a function only of the respective fixed circuit size constants.\nThe ECCVM/Translator VKs are now default constructed with the correct\nvalues which allows removal of a lot of explicit handling of them\nelsewhere.\n\nNote: there's more simplification that could come out of this work but\nits beyond the scope of the primary purpose of this PR which was to\nintroduce simple methods for obtaining the fixed VK data.\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/798",
          "timestamp": "2025-04-10T18:58:02Z",
          "tree_id": "4ef5e63ea0f63227dbb151e1afdff17ee318d18f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/507b68be913746f6d1e05172010e5f4d03ee8bf5"
        },
        "date": 1744316306033,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20677.828910000244,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15737.338434 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 123295281533.1,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 2134536171,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 234602669,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19999.831102999906,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16730.954654 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56350.725612,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56350728000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4071.193601000232,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3552.344782 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11868.440664,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11868443000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2265.56",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "507b68be913746f6d1e05172010e5f4d03ee8bf5",
          "message": "feat: statically defined ECCVM/Translator VK data (#13395)\n\nIntroduces static methods for initializing the verification keys for\nECCVM/Translator. This is possible since the VK commitments for these\nVMs are a function only of the respective fixed circuit size constants.\nThe ECCVM/Translator VKs are now default constructed with the correct\nvalues which allows removal of a lot of explicit handling of them\nelsewhere.\n\nNote: there's more simplification that could come out of this work but\nits beyond the scope of the primary purpose of this PR which was to\nintroduce simple methods for obtaining the fixed VK data.\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/798",
          "timestamp": "2025-04-10T18:58:02Z",
          "tree_id": "4ef5e63ea0f63227dbb151e1afdff17ee318d18f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/507b68be913746f6d1e05172010e5f4d03ee8bf5"
        },
        "date": 1744316316414,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30197,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17823,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9064,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10736,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12776,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "40b34ef0fed0e3044a0485a55c4c0c3917c51d46",
          "message": "chore: remove lingering log (#13408)\n\nFixes #13355\n\nThe `bridgeL1FeeJuice` function already does logging based on whether it\nmints or not, so not needed directly in the cli part as well.",
          "timestamp": "2025-04-10T20:39:27Z",
          "tree_id": "030ab94bdf249888befb79860cdac314f5943d2b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/40b34ef0fed0e3044a0485a55c4c0c3917c51d46"
        },
        "date": 1744321417408,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30333,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18304,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9143,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10858,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12868,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "a045f7852fa17320666daa65b658601559585bb7",
          "message": "chore(dep): bump crypto polyfill (#13466)\n\ntitle",
          "timestamp": "2025-04-10T22:01:02Z",
          "tree_id": "fb6c55075aef14cbfffc53184b99288810e03db8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a045f7852fa17320666daa65b658601559585bb7"
        },
        "date": 1744325908751,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30414,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18413,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9136,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10788,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12838,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "29d737e7811be26586577061c0b409a3da9f2dcb",
          "message": "feat: Reorg cheat codes (#13367)\n\nLeverages [`anvil_reorg` and\n`anvil_rollback`](https://github.com/foundry-rs/foundry/discussions/10267)\nto simulate reorgs in EthCheatCodes.\n\nRequires foundry `nightly-fe92e7ef225c6380e657e49452ce931871ae56bc`\n(2025-01-31T00:20:44.300723007Z) or later.",
          "timestamp": "2025-04-10T23:04:17Z",
          "tree_id": "8b96731538e53f3333947fd6ad6b1bf2e6f55099",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/29d737e7811be26586577061c0b409a3da9f2dcb"
        },
        "date": 1744329857765,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30189,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17873,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9154,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10798,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12762,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "95b199e9353b4666687ae3e1907d289c4ef60e05",
          "message": "fix: PXE sync batch and plantext deploy sent tx (#13476)\n\nFixes extracted from playground branch",
          "timestamp": "2025-04-11T06:04:24Z",
          "tree_id": "0fda1a3a240e03a3b16437539ff311d3b2061b7d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/95b199e9353b4666687ae3e1907d289c4ef60e05"
        },
        "date": 1744354853925,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29993,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17957,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9226,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10793,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12750,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": false,
          "id": "391bc72767bd722ee5cdf3b61100bd3ce15199f6",
          "message": "fix: suppress mock call warnings (#13443)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-04-11T09:22:53Z",
          "tree_id": "c10373533290fef72f8a1006d69ff2e199b0e155",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/391bc72767bd722ee5cdf3b61100bd3ce15199f6"
        },
        "date": 1744368044384,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20612.08550299989,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15660.752287000001 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 123245748779.40001,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 2163314415,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 234374651,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19927.65749199998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16750.40558 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56209.418456,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56209420000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4208.921771000405,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3420.670904 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11926.771143,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11926778000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2265.56",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "distinct": false,
          "id": "391bc72767bd722ee5cdf3b61100bd3ce15199f6",
          "message": "fix: suppress mock call warnings (#13443)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-04-11T09:22:53Z",
          "tree_id": "c10373533290fef72f8a1006d69ff2e199b0e155",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/391bc72767bd722ee5cdf3b61100bd3ce15199f6"
        },
        "date": 1744368054724,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29950,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17858,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9113,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10841,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12693,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": false,
          "id": "e9922dc3feec3396f2d6611dac625af6e7871f63",
          "message": "feat: dsl layer for recursive avm verifier v2 (#13362)\n\nThis PR creates the DSL layer for the goblinized avm recursive verifier\nversion 2.\nThe core logic lies in avm2_recursion_constraint.cpp and the goblinized\nv2 verifier is activated in routine process_avm_recursion_constraints()\nof acir_format.cpp.\n\nAs a consequence of enabling this verifier in the DSL layer, the AVM\nintegration tests are hooked with this version. The AVM integration test\nwas upgraded as it now integrates a clientIvc proof as well.\nIn addition, the new avm recursive verifier was added in the\nrollup_ivc_integration test.\n\nDuring this work, we hit an issue related to ipa claim/proof which is\nnot yet properly handled in the DSL layer which required us to\ntemporarily remove them from the goblinized avm recursive verifier. This\nunfortunately led to the unit test AvmRecursiveTests.GoblinRecursion\nbeing temporarily disabled.\n\n---------\n\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>\nCo-authored-by: sirasistant <sirasistant@gmail.com>",
          "timestamp": "2025-04-11T09:34:12Z",
          "tree_id": "f6f83a48cf4599aebab42a1d0118430b308ee161",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e9922dc3feec3396f2d6611dac625af6e7871f63"
        },
        "date": 1744368911412,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20998.283053999785,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15794.623552000001 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 123254055819.3,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 2132097587,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 234999154,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19773.351708000064,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16813.639808999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56854.631297,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56854633000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4061.4933980000387,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3544.794718 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12040.16989,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12040175000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2265.56",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "distinct": false,
          "id": "e9922dc3feec3396f2d6611dac625af6e7871f63",
          "message": "feat: dsl layer for recursive avm verifier v2 (#13362)\n\nThis PR creates the DSL layer for the goblinized avm recursive verifier\nversion 2.\nThe core logic lies in avm2_recursion_constraint.cpp and the goblinized\nv2 verifier is activated in routine process_avm_recursion_constraints()\nof acir_format.cpp.\n\nAs a consequence of enabling this verifier in the DSL layer, the AVM\nintegration tests are hooked with this version. The AVM integration test\nwas upgraded as it now integrates a clientIvc proof as well.\nIn addition, the new avm recursive verifier was added in the\nrollup_ivc_integration test.\n\nDuring this work, we hit an issue related to ipa claim/proof which is\nnot yet properly handled in the DSL layer which required us to\ntemporarily remove them from the goblinized avm recursive verifier. This\nunfortunately led to the unit test AvmRecursiveTests.GoblinRecursion\nbeing temporarily disabled.\n\n---------\n\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>\nCo-authored-by: sirasistant <sirasistant@gmail.com>",
          "timestamp": "2025-04-11T09:34:12Z",
          "tree_id": "f6f83a48cf4599aebab42a1d0118430b308ee161",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e9922dc3feec3396f2d6611dac625af6e7871f63"
        },
        "date": 1744368921596,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29949,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17889,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9222,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10820,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12767,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "cf18f8e674406ca0a50674cf200b58be0cbf4856",
          "message": "chore: Bump Noir reference (#13478)\n\nAutomated pull of nightly from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nchore: add benchmark for ACVM arithmetic solver\n(https://github.com/noir-lang/noir/pull/8003)\nfeat: attribute locations (https://github.com/noir-lang/noir/pull/8006)\nfix(LSP): implement missing members associated constants\n(https://github.com/noir-lang/noir/pull/8016)\nchore: bump a few versions in yarn.lock\n(https://github.com/noir-lang/noir/pull/8014)\nchore: bump external pinned commits\n(https://github.com/noir-lang/noir/pull/8015)\nchore(deps): bump koa from 2.14.2 to 2.16.1\n(https://github.com/noir-lang/noir/pull/8013)\nchore: improve checking of github urls in `noir_wasm`\n(https://github.com/noir-lang/noir/pull/8012)\nfix(parser): error on missing function body\n(https://github.com/noir-lang/noir/pull/8001)\nfix: better tests to check for unused struct error\n(https://github.com/noir-lang/noir/pull/8007)\nfix: checks for index out of bounds also for arrays\n(https://github.com/noir-lang/noir/pull/7827)\nfeat(stdlib): Expose the times a mock oracle is called\n(https://github.com/noir-lang/noir/pull/7996)\nfeat: add `loop` generator to AST fuzzer\n(https://github.com/noir-lang/noir/pull/7985)\nfeat: allow splicing a resolved function into an attribute name\n(https://github.com/noir-lang/noir/pull/7956)\nchore: bump `crossbeam-channel` to `v0.5.15`\n(https://github.com/noir-lang/noir/pull/8005)\nchore: add `teddav/tdd.nr` to external repo checks\n(https://github.com/noir-lang/noir/pull/7994)\nchore: clippy fixes (https://github.com/noir-lang/noir/pull/8002)\nEND_COMMIT_OVERRIDE\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-04-11T09:51:33Z",
          "tree_id": "f20afbf6148f9ac475df7e674e06cece9129f426",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cf18f8e674406ca0a50674cf200b58be0cbf4856"
        },
        "date": 1744369953578,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30980,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18315,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9116,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10799,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12928,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "73d6cf73d0ed63f25c86521cb3efb5afac53a385",
          "message": "feat: Evolve nullifier read gadget into a read/write gadget (#13440)\n\n- Implement a write sidecar in the nullifier read gadget\n - Use it in tx level to insert the nonrevertible nullifiers\n - Use nullifier read to prove membership of the deployment nullifier",
          "timestamp": "2025-04-11T13:25:40Z",
          "tree_id": "b36e4297a709f5290a213c8a7e0e078356a555ad",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/73d6cf73d0ed63f25c86521cb3efb5afac53a385"
        },
        "date": 1744381517864,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20944.458966999948,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15585.771579 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 123253041988.09998,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 2141389740,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 232021909,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19812.256057000013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16568.391741 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56747.248763999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56747243000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4043.395593000241,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3486.9049250000003 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11993.374708,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11993380000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2265.56",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "73d6cf73d0ed63f25c86521cb3efb5afac53a385",
          "message": "feat: Evolve nullifier read gadget into a read/write gadget (#13440)\n\n- Implement a write sidecar in the nullifier read gadget\n - Use it in tx level to insert the nonrevertible nullifiers\n - Use nullifier read to prove membership of the deployment nullifier",
          "timestamp": "2025-04-11T13:25:40Z",
          "tree_id": "b36e4297a709f5290a213c8a7e0e078356a555ad",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/73d6cf73d0ed63f25c86521cb3efb5afac53a385"
        },
        "date": 1744381527398,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30975,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18346,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9201,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10815,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12774,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "39f4ec0c9d0bba6fdde61509ed85c67d099f4310",
          "message": "feat: compute padding indicator array in-circuit (#13417)\n\nPreparation step for removing insecure `dummy_round` bools in Sumcheck\nand Shplemini.\n\nFor full description, see the docs in `padding_indicator_array.hpp`",
          "timestamp": "2025-04-11T15:39:11Z",
          "tree_id": "6cee09ed45ea8a3011900043495a51a1ec0a4c82",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/39f4ec0c9d0bba6fdde61509ed85c67d099f4310"
        },
        "date": 1744392572893,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20749.420709000107,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15674.957239 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 123281576561.09999,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 2126023130,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 245245825,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20050.522365000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16795.430225999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56455.862718,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56455865000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4062.0174509999742,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3537.241021 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11976.509828,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11976513000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2265.56",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "39f4ec0c9d0bba6fdde61509ed85c67d099f4310",
          "message": "feat: compute padding indicator array in-circuit (#13417)\n\nPreparation step for removing insecure `dummy_round` bools in Sumcheck\nand Shplemini.\n\nFor full description, see the docs in `padding_indicator_array.hpp`",
          "timestamp": "2025-04-11T15:39:11Z",
          "tree_id": "6cee09ed45ea8a3011900043495a51a1ec0a4c82",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/39f4ec0c9d0bba6fdde61509ed85c67d099f4310"
        },
        "date": 1744392582579,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30427,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18086,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9170,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10901,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12565,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "ebe68db5966269f6e4849cadb3aaee051faed942",
          "message": "chore(avm): nuke vm1 (#13484)\n\nWe have pinned the commit to be able to refer back to the useful files.\nRemoving the code and BB dependency should speed up compilation.",
          "timestamp": "2025-04-11T16:37:21Z",
          "tree_id": "fce7a914c87cb64aa3f2dd4ae2c7ec08ebe8cc9e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ebe68db5966269f6e4849cadb3aaee051faed942"
        },
        "date": 1744392817744,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20818.004229000053,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15826.663074999999 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 123261605187.30002,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 2135791826,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 232184505,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19967.15719299982,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16788.486854 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56592.446092000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56592450000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4123.686174999875,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3515.062703 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12091.923953999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12091927000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2265.56",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "ebe68db5966269f6e4849cadb3aaee051faed942",
          "message": "chore(avm): nuke vm1 (#13484)\n\nWe have pinned the commit to be able to refer back to the useful files.\nRemoving the code and BB dependency should speed up compilation.",
          "timestamp": "2025-04-11T16:37:21Z",
          "tree_id": "fce7a914c87cb64aa3f2dd4ae2c7ec08ebe8cc9e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ebe68db5966269f6e4849cadb3aaee051faed942"
        },
        "date": 1744392828098,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30672,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17955,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9158,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10806,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12657,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "b49184f21cc3e9fa25af4b2df4d5765ac9865113",
          "message": "fix: Block stream fails when pruning to a block before its start (#13473)\n\nFixes #13471\n\nI moved the `L2MemoryTipsStore` from kv-store to stdlib to be able to\ntest this. Since I was at it, I also deleted the old L2BlockDownloader\n(no longer in use). Most of the changes in this PR are related to moving\nthings around.",
          "timestamp": "2025-04-11T18:16:58Z",
          "tree_id": "18a4f716eee3b8355608070ab0bf069fcb492a88",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b49184f21cc3e9fa25af4b2df4d5765ac9865113"
        },
        "date": 1744399255284,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30761,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17972,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9105,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10763,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12778,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "c580e8baa1df6afe129115cb12f82d2bdf4783e9",
          "message": "feat: fast PXE sync (#13475)\n\nThis makes PXE's syncing process much faster as it will skip downloading\nmost blocks from the node and jump all the way to the last finalized\none. PXE not having these blocks is not an issue since they aren't used\nfor anything other than to detect reorgs, for which having the last\nfinalized one is sufficient.\n\n---------\n\nCo-authored-by: thunkar <gregojquiros@gmail.com>",
          "timestamp": "2025-04-11T20:06:04Z",
          "tree_id": "9abd5106045152d6a97035ae46c67d9e4045260a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c580e8baa1df6afe129115cb12f82d2bdf4783e9"
        },
        "date": 1744405489343,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30427,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18345,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9158,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10805,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12634,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "927e80d8e69672b3ebd44414dcea502c4aac0151",
          "message": "feat: support HonkRecursionConstraints in ClientIVC (#13401)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1243.\n\nThis PR enables HRCs while building Mega circuits, which means they can\nbe part of app circuits during CIVC.\n\nThe pairing point object functionality that comes with HRCs is not\nsupported yet though, and that is definitely required for secure usage.",
          "timestamp": "2025-04-11T19:51:59Z",
          "tree_id": "a22c01744c4a29c569024175a86068f81a0bc5b6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/927e80d8e69672b3ebd44414dcea502c4aac0151"
        },
        "date": 1744405677737,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20912.040095000066,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15924.422413999999 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 123276138376.7,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 2140883039,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 229281260,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19834.938541000156,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16654.405501000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56527.606417999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56527608000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4015.464221000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3493.622551 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11924.460804000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11924467000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2209.56",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "927e80d8e69672b3ebd44414dcea502c4aac0151",
          "message": "feat: support HonkRecursionConstraints in ClientIVC (#13401)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1243.\n\nThis PR enables HRCs while building Mega circuits, which means they can\nbe part of app circuits during CIVC.\n\nThe pairing point object functionality that comes with HRCs is not\nsupported yet though, and that is definitely required for secure usage.",
          "timestamp": "2025-04-11T19:51:59Z",
          "tree_id": "a22c01744c4a29c569024175a86068f81a0bc5b6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/927e80d8e69672b3ebd44414dcea502c4aac0151"
        },
        "date": 1744405687497,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30626,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18035,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9144,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10807,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12734,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "29302c497fd29e53c20847d83ab2469435742959",
          "message": "chore: Try fix flake in reorg tests (#13498)\n\n- Ensures no caching is used for block numbers\n- Less strict assertions on block numbers",
          "timestamp": "2025-04-11T20:37:06Z",
          "tree_id": "05a5b2aca30e3a22f79f5bd536e38689afd07d9e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/29302c497fd29e53c20847d83ab2469435742959"
        },
        "date": 1744407245577,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30485,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17983,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9155,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10824,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12641,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "09a2b2e46aeb9464cf07c1d13fe2acce740c234d",
          "message": "feat!: rename encrypted_logs to messages (#13496)\n\nFurther renaming and moving incoming, but this is the largest piece as\nit affects all files, so having this as a separate part of the changeset\nwill avoid very messy PR diffs.\n\nedit: ended up making a much larger changeset, since it's all renamings.\nSummary:\n\n```\n- `encrypted_logs` to `messages`: this module now handles much more than just encrypted logs (including unconstrained message delivery, message encoding, etc.)\n- `log_assembly_strategies` to `logs`\n- `discovery` moved to `messages`: given that what is discovered are messages\n- `default_aes128` removed\n```\n\nWhich means there's no longer an `encrypted_logs` directory in\n`aztec-nr` (which I always found odd) and we instead have `messages`,\nwith the following content:\n\n```\n$ tree messages/\nmessages/\n├── discovery\n│   ├── mod.nr\n│   ├── nonce_discovery.nr\n│   ├── partial_notes.nr\n│   ├── pending_tagged_log.nr\n│   ├── private_logs.nr\n│   └── private_notes.nr\n├── encoding.nr\n├── encryption\n│   ├── aes128.nr\n│   ├── log_encryption.nr\n│   ├── mod.nr\n│   └── poseidon2.nr\n├── logs\n│   ├── arithmetic_generics_utils.nr\n│   ├── event.nr\n│   ├── mod.nr\n│   ├── note.nr\n│   └── utils.nr\n├── mod.nr\n└── msg_type.nr\n```\n\nwhich seems fairly reasonable: discovery is about discovering messages,\nencoding is of messages, encryption is arguably not strictly just\nmessages but it _is_ the only usage we have for it, and logs is about\nhow to put a message in a log.",
          "timestamp": "2025-04-11T21:08:44Z",
          "tree_id": "7a8b7ff9ba0232bef436e34ecbd273b76c98f703",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/09a2b2e46aeb9464cf07c1d13fe2acce740c234d"
        },
        "date": 1744409348012,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30606,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18335,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9219,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10880,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12931,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "b855fcd2e3f7cd8eeac984de2b167dbc34254173",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"e90f27d7b2\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"e90f27d7b2\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-12T02:29:02Z",
          "tree_id": "8b4bbfe86141d13323e4ee7991a16efac49b7e73",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b855fcd2e3f7cd8eeac984de2b167dbc34254173"
        },
        "date": 1744426863504,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30470,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18056,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9201,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10971,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12662,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "b184863da69d6512bc4455d3c4ce7f9cd2c85aec",
          "message": "chore: Bump Noir reference (#13505)\n\nAutomated pull of nightly from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nchore: parse IfElse in SSA parser\n(https://github.com/noir-lang/noir/pull/8043)\nfeat: `ssa::create_program_with_passes`\n(https://github.com/noir-lang/noir/pull/8035)\nchore: don't use `set_value_from_id` in\n`remove_truncate_after_range_checks`\n(https://github.com/noir-lang/noir/pull/8037)\nfix(ssa): Remove OOB checks inserted during DIE\n(https://github.com/noir-lang/noir/pull/7995)\nfix(fuzz): remove duplicate gen_loop, move unconstrained generators up\n(https://github.com/noir-lang/noir/pull/8029)\nchore: remove unnecessary double compilation\n(https://github.com/noir-lang/noir/pull/8031)\nfix(ssa): Map terminator instructions after constant folding\n(https://github.com/noir-lang/noir/pull/8019)\nfix: use proper max bit size during truncation\n(https://github.com/noir-lang/noir/pull/8010)\nfix(docs): fix proof splitting script in solidity guide\n(https://github.com/noir-lang/noir/pull/8033)\nchore: add workflow to run nightly tests on ARM64\n(https://github.com/noir-lang/noir/pull/8027)\nchore: correct name of acvm benchmark\n(https://github.com/noir-lang/noir/pull/8032)\nchore: fix failing test on MacOS\n(https://github.com/noir-lang/noir/pull/8030)\nfeat: add `while` generator to AST fuzzer\n(https://github.com/noir-lang/noir/pull/8021)\nchore: clippy fixes (https://github.com/noir-lang/noir/pull/8020)\nfeat(fuzz): Generate arbitrary `Call` in function body\n(https://github.com/noir-lang/noir/pull/7987)\nchore: use insta snapshots for ssa tests\n(https://github.com/noir-lang/noir/pull/7989)\nchore: add snapshot tests for the build artifacts as produced by\ntest_programs (https://github.com/noir-lang/noir/pull/7986)\nEND_COMMIT_OVERRIDE\n\n---------\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-04-14T09:33:42Z",
          "tree_id": "8b1964ee61275182b24ab57a3cda29e25c5077d8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b184863da69d6512bc4455d3c4ce7f9cd2c85aec"
        },
        "date": 1744626756388,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30574,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17994,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9140,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10905,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12653,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "e3a337b4ab6792b1aafe0001d92f0aac89c4b92c",
          "message": "chore(txe): no custom public merkle db (#13508)\n\nThe TXE does not need a custom db because it already gets the net public\ndata writes from the public \"outputs\" of the simulation.",
          "timestamp": "2025-04-14T10:30:28Z",
          "tree_id": "ca5cc2faef24b5165862a0a7243da2a56e175820",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e3a337b4ab6792b1aafe0001d92f0aac89c4b92c"
        },
        "date": 1744629747618,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30576,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18008,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9257,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10864,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12707,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "e09699ff628bb14bbb9fe0b07111fe80b1aa1c7c",
          "message": "feat!: remove PXE starting block (#13504)\n\nAs of https://github.com/AztecProtocol/aztec-packages/pull/13475, PXE no\nlonger needs to use the `startingBlock` option, and hence we can also\nremove the environment variable used to configure it. The effects of\npassing no value are equivalent to a value of 1, which was the default\nif the envvar was unset.",
          "timestamp": "2025-04-14T11:28:14Z",
          "tree_id": "47902f8d544767fcaf01fbf0e9cbafa201a5aa74",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e09699ff628bb14bbb9fe0b07111fe80b1aa1c7c"
        },
        "date": 1744634260916,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30579,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18129,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9162,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10803,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12629,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          }
        ]
      }
    ],
    "P2P Testbench": [
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
          "id": "912f2c539bcf382e28df4afa0fc44fec89f3cd85",
          "message": "feat(p2p): gossipsub scoring adjustments + testbench",
          "timestamp": "2025-02-23T02:27:21Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/12075/commits/912f2c539bcf382e28df4afa0fc44fec89f3cd85"
        },
        "date": 1740346403428,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "degree-1-strict - numberReceived",
            "value": 3,
            "unit": "ma"
          },
          {
            "name": "degree-1-strict - minDelay",
            "value": 383,
            "unit": "ma"
          },
          {
            "name": "degree-1-strict - maxDelay",
            "value": 5276,
            "unit": "ma"
          },
          {
            "name": "degree-1-strict - averageDelay",
            "value": 2716.33,
            "unit": "ma"
          },
          {
            "name": "degree-1-strict - medianDelay",
            "value": 2490,
            "unit": "ma"
          },
          {
            "name": "normal-degree-50-nodes - numberReceived",
            "value": 26,
            "unit": "ma"
          },
          {
            "name": "normal-degree-50-nodes - minDelay",
            "value": 50,
            "unit": "ma"
          },
          {
            "name": "normal-degree-50-nodes - maxDelay",
            "value": 7221,
            "unit": "ma"
          },
          {
            "name": "normal-degree-50-nodes - averageDelay",
            "value": 2146.35,
            "unit": "ma"
          },
          {
            "name": "normal-degree-50-nodes - medianDelay",
            "value": 925,
            "unit": "ma"
          }
        ]
      }
    ]
  }
}