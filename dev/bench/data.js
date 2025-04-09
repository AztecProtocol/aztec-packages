window.BENCHMARK_DATA = {
  "lastUpdate": 1744200912537,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "C++ Benchmark": [
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
        "date": 1743844227886,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29173,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17630,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9007,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10664,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12476,
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
          "id": "d888d0e618c242b98551daf954cfe8225226c171",
          "message": "chore(avm): use tx hash as avm proof identifier (#13304)\n\n`functionName` didn't make sense anymore since we now process a whole\nTX.",
          "timestamp": "2025-04-05T08:54:06Z",
          "tree_id": "3e97592b6cd49af08373cc4719a7114a5ce9f518",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d888d0e618c242b98551daf954cfe8225226c171"
        },
        "date": 1743846595496,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20695.36305299971,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15804.67196 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 122494268329.40001,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 2022747940,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 273167868,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19701.057096000113,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16797.398004000002 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55894.624560000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55894624000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4084.906800999761,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3543.9283429999996 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11801.182714999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11801186000 ms\nthreads: 1"
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
          "id": "d888d0e618c242b98551daf954cfe8225226c171",
          "message": "chore(avm): use tx hash as avm proof identifier (#13304)\n\n`functionName` didn't make sense anymore since we now process a whole\nTX.",
          "timestamp": "2025-04-05T08:54:06Z",
          "tree_id": "3e97592b6cd49af08373cc4719a7114a5ce9f518",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d888d0e618c242b98551daf954cfe8225226c171"
        },
        "date": 1743846605428,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29111,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17729,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8926,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10623,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12476,
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
          "id": "869dc1fbc36d5ab26e5e7828442331332fb9a357",
          "message": "feat(avm): appendLeaves hints (#13312)",
          "timestamp": "2025-04-05T19:47:08Z",
          "tree_id": "d3f48b8d897d7f8aa6aff94e5b0af7a7f9b1fe55",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/869dc1fbc36d5ab26e5e7828442331332fb9a357"
        },
        "date": 1743885839191,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20721.93261600023,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15710.171837999998 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 122458278909.40001,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 2007083040,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 283507538,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19639.075063999826,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16649.454383 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56162.680881,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56162681000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4086.030835999736,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3519.653037 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12140.285993000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12140290000 ms\nthreads: 1"
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
          "id": "869dc1fbc36d5ab26e5e7828442331332fb9a357",
          "message": "feat(avm): appendLeaves hints (#13312)",
          "timestamp": "2025-04-05T19:47:08Z",
          "tree_id": "d3f48b8d897d7f8aa6aff94e5b0af7a7f9b1fe55",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/869dc1fbc36d5ab26e5e7828442331332fb9a357"
        },
        "date": 1743885848542,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29315,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17701,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8999,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10670,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12663,
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
          "id": "0e38c2665d8dd8f6714b8835bf658ee52f39f0f2",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"8dde369fd0\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"8dde369fd0\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-06T02:30:51Z",
          "tree_id": "294a64cebd88ce5e0d486a2bfd12da31e5515ed3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0e38c2665d8dd8f6714b8835bf658ee52f39f0f2"
        },
        "date": 1743908331868,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29172,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17692,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8935,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10676,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12586,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
        "date": 1743965816414,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20715.052603000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15740.420819 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 122494918513.40001,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 2014380404,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 287525954,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19693.229685999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16693.438009 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56164.088737,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56164093000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4076.731086000109,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3528.8698520000003 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11925.296628,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11925299000 ms\nthreads: 1"
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
        "date": 1743965829178,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29157,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17827,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8912,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10624,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12583,
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
          "id": "c199f2c4ebd3e1045ebab317e1e5f76a0d9a2627",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"6382fc0870\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"6382fc0870\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-07T02:31:06Z",
          "tree_id": "966d3ab59ca7fad75ed57f358eeb8b69ead08aee",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c199f2c4ebd3e1045ebab317e1e5f76a0d9a2627"
        },
        "date": 1743994762358,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29274,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17688,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8905,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10695,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12578,
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
          "distinct": true,
          "id": "829a315c6a6306a4b36023a64fcc5a04dfc0a496",
          "message": "chore: add get canonical sponsored fpc and cleanup fee opts in cli wallet (#13319)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.\n\nCo-authored-by: sklppy88 <esau@aztecprotocol.com>",
          "timestamp": "2025-04-07T08:35:51Z",
          "tree_id": "ecb82893bfd0342ffa7cae8ae02ffa174c9c8214",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/829a315c6a6306a4b36023a64fcc5a04dfc0a496"
        },
        "date": 1744016995304,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29128,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17810,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8900,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10650,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12534,
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
          "id": "2e6cebde0308f3a4e4fbb0b7cb36e354b23924fa",
          "message": "chore: improve re-ex flake (#13301)\n\nPasses a parallel with 100 iterations on mainframe\n\n**What was happening**\n\n- For the second test, we mock the `publicProcessorFactory.create` which\nis run every time a block will be built.\n- The happy path expects this to get called by the proposer, trigger the\nmapping switch, leading the rest of the calls to trigger a timeout.\n- Every 100 of so times the test is run, the proposer ends up building\nthe block before we mock, which means that not all of the validators run\nthe timeout, so only 2 of them time out, not 3 as the test requires\n\nIn the interests of keeping the test short, and not cleaning out state\nbetween each run, we simply relax the condition that all validators must\nexperience an error, since we assert that the transaction fails to mine",
          "timestamp": "2025-04-07T10:36:17Z",
          "tree_id": "f4d43e0a3ccacd7c8e96718fede34f4e908c20b8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2e6cebde0308f3a4e4fbb0b7cb36e354b23924fa"
        },
        "date": 1744024234714,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29298,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17632,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8975,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10639,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12563,
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
          "id": "37001ab4b72abc09c492cf7c05278b211837804a",
          "message": "fix: Wait for L1 mint tx on cross chain test harness (#13344)\n\nAttempt at fixing flakes where the balance expectation failed:\n\n```\n18:22:41   ● e2e_cross_chain_messaging token_bridge_public › Publicly deposit funds from L1 -> L2 and withdraw back to L1\n18:22:41\n18:22:41     expect(received).toEqual(expected) // deep equality\n18:22:41\n18:22:41     Expected: 1000000n\n18:22:41     Received: 0n\n18:22:41\n18:22:41       234 |     });\n18:22:41       235 |     await contract.write.mint([this.ethAccount.toString(), amount]);\n18:22:41     > 236 |     expect(await this.l1TokenManager.getL1TokenBalance(this.ethAccount.toString())).toEqual(amount);\n18:22:41           |                                                                                     ^\n18:22:41       237 |   }\n18:22:41       238 |\n18:22:41       239 |   getL1BalanceOf(address: EthAddress) {\n18:22:41\n18:22:41       at CrossChainTestHarness.toEqual [as mintTokensOnL1] (shared/cross_chain_test_harness.ts:236:85)\n18:22:41       at Object.<anonymous> (e2e_cross_chain_messaging/token_bridge_public.test.ts:46:5)\n```",
          "timestamp": "2025-04-07T12:45:34Z",
          "tree_id": "a42e3890d9aa726c20b393204f52e3f87cc9ae43",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/37001ab4b72abc09c492cf7c05278b211837804a"
        },
        "date": 1744032777270,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29349,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17671,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8896,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10568,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12481,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
        "date": 1744041656086,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29107,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17696,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8923,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10710,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12539,
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
          "id": "a4d33f690745cb9b3212d4f9d226e6c3df4800b9",
          "message": "chore(discv): improve flakey self update ip test (#13317)\n\n## Overview\n\n\nin http://ci.aztec-labs.com/c3954cbd813c6468 we see that \n\nINFO: p2p:discv5_service:7894 Multiaddr updated\n\nWhich is our success case, even thought the test fails. \n\nSwapping Promise.all to Promise.allSettled as we do not care if we\nreject if we end up with our IP updated",
          "timestamp": "2025-04-07T15:15:50Z",
          "tree_id": "ddb3627c2006c0a8237e72a5ac25e313e54a5939",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a4d33f690745cb9b3212d4f9d226e6c3df4800b9"
        },
        "date": 1744045398556,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29148,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17844,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8968,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10625,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12489,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
        "date": 1744046466677,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29227,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17846,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8899,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10638,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12486,
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
          "id": "a84a30c4f275da672a4af543424b32d001412158",
          "message": "fix: IVC integration native (#13343)\n\nThis test suite was broken with the changes to use a hardcoded VK for\nCIVC verification. This PR fixes the --write-vk flag in CIVC api so we\ncan write the VK in the mock protocol circuits testing. By default\nwrite-vk is false.",
          "timestamp": "2025-04-07T17:20:15Z",
          "tree_id": "0dead6337c10e9d97d01c3a8ec378e5f855a350e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a84a30c4f275da672a4af543424b32d001412158"
        },
        "date": 1744050131564,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20828.276575000018,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15701.818494000001 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 122461704943.40001,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1993455034,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 284153524,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19632.29602399997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16718.522393 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56183.766045,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56183765000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4119.554715000049,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3555.106204 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12010.030973999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12010034000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2153.56",
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
          "id": "a84a30c4f275da672a4af543424b32d001412158",
          "message": "fix: IVC integration native (#13343)\n\nThis test suite was broken with the changes to use a hardcoded VK for\nCIVC verification. This PR fixes the --write-vk flag in CIVC api so we\ncan write the VK in the mock protocol circuits testing. By default\nwrite-vk is false.",
          "timestamp": "2025-04-07T17:20:15Z",
          "tree_id": "0dead6337c10e9d97d01c3a8ec378e5f855a350e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a84a30c4f275da672a4af543424b32d001412158"
        },
        "date": 1744050141240,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29291,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17648,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8967,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10708,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12518,
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
          "id": "b4221efeb67a16e037b68416b9bd6e3677fc897d",
          "message": "fix: port_change test + testbench (#13326)\n\n## Overview\n\nA few prs had made this test fall behind, it being a flake left stuff un\ncorrected.\n\nThere are a couple of problems with this test / the testbench. \n**Testbench**\n- log out puts had changed, leaving the testbench itself bricked\n- Turning off transaction validation as we are producing a dummy\ntransaction\n\n**Port Change**\n- reducing node counts so my resource hypothesis can hopefully not be a\ncrutch for me to fallback on\n- Treat the bootnodes as full peers so we actually re discover them",
          "timestamp": "2025-04-07T18:26:32Z",
          "tree_id": "0c77e04334aa9101912539ecfd5249ff1dc3bcfa",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b4221efeb67a16e037b68416b9bd6e3677fc897d"
        },
        "date": 1744053870442,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29012,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17736,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8969,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10579,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12558,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
        "date": 1744058395598,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29051,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17706,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8914,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10591,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12543,
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
          "id": "64675db1232d1344da8e0f1ebd6b87b1522ad59a",
          "message": "chore: rename logs to msg (#13364)\n\nThis expands on the 'message' term:\n\n- contracts send and receive messages\n- messages follow standard encoding, by having a message type id,\nmetadata, and content\n- encoded messages are encrypted into ciphertext\n- ciphertext can be emitted alongside a tag in a log\n- ciphertext is decrypted into plaintext, which is an encoded message\n- from it we get back message metadata and content\n\nBefore this PR, we call both the log and the message 'logs', which is\nincorrect and confusing.\n\nThe renaming is partial since some concepts are still tied to logs (e.g.\nevents *must* be in logs, message processing is currently done on logs\nstored in capsules, etc.), but this is a good first step.",
          "timestamp": "2025-04-07T21:36:12Z",
          "tree_id": "a4f2192b2549e65875b8a92937cd5cdbd244ecfb",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/64675db1232d1344da8e0f1ebd6b87b1522ad59a"
        },
        "date": 1744064221230,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29191,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17769,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8928,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10659,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12519,
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
          "id": "0d5add0bc5ed8f6f32e5299965bb418553178638",
          "message": "chore: improve capsule performance and add tests (#13284)\n\nBest reviewed by ignoring whitespace changes in the diff.\n\nThis makes `copyCapsule` create a transaction, massively reducing how\nlong it takes to copy large numbers of elements, which we do when\ndeleting arbitrary entries in a `CapsuleArray`. I added some tests with\nhardcoded timeouts to try to detect performance regressions, though\neventually these should be collected along with other metrics in some\nmore complete manner.\n\nI also added tests for the `appendToCapsuleArray` function @benesjan\nintroduced, since these were missing.\n\n---------\n\nCo-authored-by: Gregorio Juliana <gregojquiros@gmail.com>",
          "timestamp": "2025-04-07T22:20:16Z",
          "tree_id": "ec9e2096961e9568a3e641574a103f1c3948f5c8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0d5add0bc5ed8f6f32e5299965bb418553178638"
        },
        "date": 1744066517471,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29094,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17829,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8973,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10671,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12430,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
        "date": 1744067390690,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 28986,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17641,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8903,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10649,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12398,
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
          "id": "ec4fd7454e964965f6ff6529a244b2bffb2cd8e4",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"50d90d3551\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"50d90d3551\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-08T02:29:34Z",
          "tree_id": "db2e23e429c2e98fd76d7c3b6b248950e4e0532d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ec4fd7454e964965f6ff6529a244b2bffb2cd8e4"
        },
        "date": 1744081090763,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29257,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17685,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8885,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10586,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12490,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
        "date": 1744083604347,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29039,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17703,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8968,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10607,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12455,
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
          "id": "1c3d70b44a904c3a0542f78995bc0aef50068c96",
          "message": "chore: add option to register contract class to deploy account in cli-wallet (#13359)\n\nWithout this, devnet / testnet were having issues deploying the first\nschnorr account contract.",
          "timestamp": "2025-04-08T09:03:26Z",
          "tree_id": "e328d87de190be914f4bcbcce766210e41d6e130",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1c3d70b44a904c3a0542f78995bc0aef50068c96"
        },
        "date": 1744105383663,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29106,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17655,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8992,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10679,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12449,
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
          "distinct": true,
          "id": "ca6c7a7ba344fa15d3abe5515d24b65c5585c8fd",
          "message": "fix: txe node should not use base fork for find_leaves_indexes (#13341)\n\nThis is a change to unblock defi-wonderland as they're running into some\nissues after moving more log processing to noir. This will be more or\nless refactored in a imminent txe rework / cleanup.\n\nThe crux of this fix was that `this.baseFork` does not include any block\nmetadata, because it is not checkpointed by `handleL2BlocksAndMessages`.\nWe need to specifically fetch for the `lastCommitted` state, or from\n`getSnapshot`\n\nCo-authored-by: sklppy88 <esau@aztecprotocol.com>",
          "timestamp": "2025-04-08T10:03:21Z",
          "tree_id": "5f514996931ec44a88971ef05104c445fa4b2298",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ca6c7a7ba344fa15d3abe5515d24b65c5585c8fd"
        },
        "date": 1744108313008,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29196,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17649,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8965,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10627,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12552,
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
          "id": "d68800a69e03280e0276dc3310c15a8ca528fb35",
          "message": "fix: mega zk in hiding circuit + bug fixes (#13262)\n\nFixed the bugs discovered by Taceo + it was long overdue to switch from\nMega to MegaZK for proving the hiding circuit.\n\n\nCloses https://github.com/AztecProtocol/aztec-packages/issues/13117\nCloses https://github.com/AztecProtocol/aztec-packages/issues/13116",
          "timestamp": "2025-04-08T11:51:35Z",
          "tree_id": "d48158c1a82f4464081440cc98f1e2ea63dd8f69",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d68800a69e03280e0276dc3310c15a8ca528fb35"
        },
        "date": 1744116871140,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20888.393880999956,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15801.726555 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 123897662403.59999,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 2218654799,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 275367902,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19936.845961000017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16935.458076 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56771.470582,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56771475000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4058.6656239997865,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3472.2056000000002 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11990.890476999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11990893000 ms\nthreads: 1"
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
          "id": "d68800a69e03280e0276dc3310c15a8ca528fb35",
          "message": "fix: mega zk in hiding circuit + bug fixes (#13262)\n\nFixed the bugs discovered by Taceo + it was long overdue to switch from\nMega to MegaZK for proving the hiding circuit.\n\n\nCloses https://github.com/AztecProtocol/aztec-packages/issues/13117\nCloses https://github.com/AztecProtocol/aztec-packages/issues/13116",
          "timestamp": "2025-04-08T11:51:35Z",
          "tree_id": "d48158c1a82f4464081440cc98f1e2ea63dd8f69",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d68800a69e03280e0276dc3310c15a8ca528fb35"
        },
        "date": 1744116880776,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30196,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18027,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9224,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10851,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12899,
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
          "id": "be31389ba3cf9c2833492b5c8f366e9e17bed59d",
          "message": "chore: Fix flake in reqresp p2p test (#13333)\n\nIssue seems to be that the txs get sent to the first proposer with\nlittle time for it to build the block, so it misses its shot, and then\nthat tx never reaches other nodes (since p2p gossip was disabled). This\nattempts to fix it.\n\nWIP: currently running into a `Assertion failed: Failed to get a note\n'self.is_some()'`",
          "timestamp": "2025-04-08T12:09:36Z",
          "tree_id": "50385e1584c39416383f23ef9185b43376aa971d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/be31389ba3cf9c2833492b5c8f366e9e17bed59d"
        },
        "date": 1744117048393,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30934,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18712,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9230,
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
            "value": 13197,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
        "date": 1744122704527,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29998,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18063,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9187,
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
            "value": 12765,
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
          "id": "746353898f4a62189dd896c288e36b231d77c0bf",
          "message": "feat: preload CRS files once in GKE (#13093)\n\nThis PR downloads the CRS file to a volume using a pre-install helm job\nthat then gets cloned into a `ReadOnlyMany` shared volume for all the\nagents",
          "timestamp": "2025-04-08T15:36:18Z",
          "tree_id": "8f0380d391b7aacc40095e9aed49f99bf7530904",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/746353898f4a62189dd896c288e36b231d77c0bf"
        },
        "date": 1744128924866,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30074,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18103,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9178,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10877,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12756,
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
          "id": "668616825cb9cc76bf25884ff40d77f2101272a9",
          "message": "chore: Deflake p2p client unit test (#13387)\n\nRemoves sleeps in favor of forced syncs.\n\nFixes flakes like [this one](http://ci.aztec-labs.com/8be3f58c163e887d).",
          "timestamp": "2025-04-08T15:38:44Z",
          "tree_id": "15d20e84278f842ad1487a18a838a5f1532fc166",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/668616825cb9cc76bf25884ff40d77f2101272a9"
        },
        "date": 1744129271913,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30029,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18094,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9183,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10836,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12771,
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
          "id": "7aabf7c22a6f7bd044c00c591c120c576c00d22b",
          "message": "chore: add encode/decode fns (#13369)\n\nHopefully the last step for a while in our msg encode/decode adventures.\nThis creates `encoding::{encode_message, decode_message}`, which are\nfunctions that already existed in other modules but were not yet a core\nconcept. I also added some tests.\n\n---------\n\nCo-authored-by: Jan Beneš <janbenes1234@gmail.com>",
          "timestamp": "2025-04-08T15:52:23Z",
          "tree_id": "f22dcbe39fd6d2689236e6dfecc8c6fcf5f818a9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7aabf7c22a6f7bd044c00c591c120c576c00d22b"
        },
        "date": 1744129859271,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30458,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17923,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9228,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10936,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12852,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
        "date": 1744138820253,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20913.115904999813,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15697.984725999999 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 123926103853.50002,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 2233887730,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 302979134,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19905.492672000037,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16700.932537 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 57149.340542,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 57149342000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4106.597391999912,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3515.471831 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12009.804061,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12009806000 ms\nthreads: 1"
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
        "date": 1744138835950,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30360,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18117,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9259,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10882,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12956,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
        "date": 1744143832399,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20928.703249000137,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15863.211304 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 123924078358.2,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 2262070073,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 280914184,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19965.75691499993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16876.021294000002 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56732.918806,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56732920000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4081.9409979999364,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3518.30671 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11965.472197000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11965475000 ms\nthreads: 1"
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
        "date": 1744143842100,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30266,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18077,
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
            "value": 10904,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12785,
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
          "id": "007811df98c86f29b89ad218eedfa4dfaadc44d4",
          "message": "docs: update utility fn docs (#13310)\n\nReplacement for\nhttps://github.com/AztecProtocol/aztec-packages/pull/13248 to get it out\nof the graphite stack.\n\nThis PR updates mentions of top-level unconstrained contract fns for the\nnew 'utility' term. Some instances may be missing, but I think we\ncovered the vast majority of it. I also updated language in some parts\nwere explanations were outdated, and tried to remove bits that conflated\nNoir unconstrained functions and utility functions. We'll likely want to\nexpand on this given the apparent confusion.\n\n---------\n\nCo-authored-by: benesjan <janbenes1234@gmail.com>",
          "timestamp": "2025-04-08T19:55:01Z",
          "tree_id": "7be517c7601f05a23cf05f78b324cf77c16f8939",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/007811df98c86f29b89ad218eedfa4dfaadc44d4"
        },
        "date": 1744145614714,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30054,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18060,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9274,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10833,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12684,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
        "date": 1744146092112,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29999,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18053,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9275,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10878,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12773,
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
          "id": "0ec191783554672ed3a182a1726d2c913a887dd9",
          "message": "feat: Add rollup IVC testing suite (#13371)\n\nAdds mock bases, merge and root rollups that use the rollup ivc scheme.\nThese are testing the IVC integration for rollup honk and will be used\nto test the integration of goblinized AVM recursive verifiers into\nrollup honk.",
          "timestamp": "2025-04-08T22:08:13Z",
          "tree_id": "36b25e12ce9ef5e15bcee03d6a04aa57736f6030",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0ec191783554672ed3a182a1726d2c913a887dd9"
        },
        "date": 1744152393397,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30026,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18011,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9196,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10876,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12746,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
        "date": 1744154790448,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30171,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18054,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9259,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10976,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12808,
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
          "id": "a27fda019057795ac7103033b9f196d6ada6e0fa",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"7ab89b96ff\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"7ab89b96ff\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-09T02:30:25Z",
          "tree_id": "e0bdc44b6196b64049824ea7d5e5b6d898941bcd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a27fda019057795ac7103033b9f196d6ada6e0fa"
        },
        "date": 1744167629293,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30044,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18054,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9236,
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
            "value": 12784,
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
          "distinct": true,
          "id": "0e30b2cb2443694bca769914b1f398fb8b1f81b7",
          "message": "chore: remove setup-l2 job as it's not needed anymore (#13375)",
          "timestamp": "2025-04-09T08:38:53Z",
          "tree_id": "2579ec9ede3e411cd86af34957b9fca8dda8c54c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0e30b2cb2443694bca769914b1f398fb8b1f81b7"
        },
        "date": 1744190039365,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30022,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17964,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9167,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10951,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12746,
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
          "id": "20a0aaa43386dcfe2942de7ddb0426ce8b64bddd",
          "message": "fix: logging ABI in errors + more aggressive hex truncation (#12715)\n\nFixes #11003 \nAlso does some more aggressive hex truncation since we're still seeing\nsome logs including the entire `args` and taking up 100s of thousands of\nchars in logs that make them unreadable",
          "timestamp": "2025-04-09T09:20:49Z",
          "tree_id": "4aa499b6f264695c7f127b3bb293d64456e43fd7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/20a0aaa43386dcfe2942de7ddb0426ce8b64bddd"
        },
        "date": 1744192482005,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30007,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17999,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9180,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10813,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12824,
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
          "id": "c4efcb3c14474488ac469814bca60f2144bc8d2d",
          "message": "fix(avm): request paths for appendLeaves (#13389)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-04-09T09:37:50Z",
          "tree_id": "b3af6ec7eb35a2d0aa9a61d89cc97ab89a191e40",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c4efcb3c14474488ac469814bca60f2144bc8d2d"
        },
        "date": 1744194926579,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20917.183827999906,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15686.711738000002 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 123951454302.29999,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 2204933235,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 278639348,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20034.810692000065,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16901.070403 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56890.663549,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56890665000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4162.629786999787,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3545.724909 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11959.498528000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11959505000 ms\nthreads: 1"
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
          "id": "c4efcb3c14474488ac469814bca60f2144bc8d2d",
          "message": "fix(avm): request paths for appendLeaves (#13389)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-04-09T09:37:50Z",
          "tree_id": "b3af6ec7eb35a2d0aa9a61d89cc97ab89a191e40",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c4efcb3c14474488ac469814bca60f2144bc8d2d"
        },
        "date": 1744194935975,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30032,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17962,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9209,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 11072,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12945,
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
          "id": "c8a766e9de7e107d5348771b5ad3adee35cab41e",
          "message": "fix: Wait for world-state to start before starting p2p (#13400)\n\nSince #13247 the p2p pool depends on world-state to be up to date for\npurging txs with insufficient balance. This means that if world-state is\nnot yet running, it will not accept `syncImmediate` calls, and will\ncause p2p to fail with the following error:\n\n```\n20:14:28 [20:14:28.999] ERROR: p2p:lmdb-v2:40401 Failed to commit transaction: Error: World State is not running. Unable to perform sync.\n20:14:28     at ServerWorldStateSynchronizer.syncImmediate (/home/aztec-dev/aztec-packages/yarn-project/world-state/dest/synchronizer/server_world_state_synchronizer.js:132:19)\n20:14:28     at AztecKVTxPool.evictInvalidTxsAfterMining (/home/aztec-dev/aztec-packages/yarn-project/p2p/dest/mem_pools/tx_pool/aztec_kv_tx_pool.js:375:44)\n20:14:28     at /home/aztec-dev/aztec-packages/yarn-project/p2p/dest/mem_pools/tx_pool/aztec_kv_tx_pool.js:82:46\n20:14:28     at /home/aztec-dev/aztec-packages/yarn-project/kv-store/dest/lmdb-v2/store.js:111:29\n20:14:29     at /home/aztec-dev/aztec-packages/yarn-project/foundation/dest/queue/serial_queue.js:56:33\n20:14:29     at FifoMemoryQueue.process (/home/aztec-dev/aztec-packages/yarn-project/foundation/dest/queue/base_memory_queue.js:110:17)\n20:14:29 [20:14:28.999] ERROR: p2p:l2-block-stream:40401 Error processing block stream: Error: World State is not running. Unable to perform sync.\n20:14:29     at ServerWorldStateSynchronizer.syncImmediate (/home/aztec-dev/aztec-packages/yarn-project/world-state/dest/synchronizer/server_world_state_synchronizer.js:132:19)\n20:14:29     at AztecKVTxPool.evictInvalidTxsAfterMining (/home/aztec-dev/aztec-packages/yarn-project/p2p/dest/mem_pools/tx_pool/aztec_kv_tx_pool.js:375:44)\n20:14:29     at /home/aztec-dev/aztec-packages/yarn-project/p2p/dest/mem_pools/tx_pool/aztec_kv_tx_pool.js:82:46\n20:14:29     at /home/aztec-dev/aztec-packages/yarn-project/kv-store/dest/lmdb-v2/store.js:111:29\n20:14:29     at /home/aztec-dev/aztec-packages/yarn-project/foundation/dest/queue/serial_queue.js:56:33\n20:14:29     at FifoMemoryQueue.process (/home/aztec-dev/aztec-packages/yarn-project/foundation/dest/queue/base_memory_queue.js:110:17)\n```\n\nSee [here](http://ci.aztec-labs.com/a97eca2e41f285b2) for a sample run.\n\nThis commit changes the Aztec node startup so it waits for world-state\nto start before kicking off p2p.",
          "timestamp": "2025-04-09T10:02:15Z",
          "tree_id": "398083263fd7f297994701285774f000859c3709",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c8a766e9de7e107d5348771b5ad3adee35cab41e"
        },
        "date": 1744195099366,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29888,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18031,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9236,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10946,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12765,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
        "date": 1744197269386,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 21082.22404299977,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15993.832080000002 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 123953947570,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 2304816053,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 284535963,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20035.21808200003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16806.388525000002 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 57109.757174,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 57109759000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4369.385540999701,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3698.5591719999998 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12426.749456,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12426753000 ms\nthreads: 1"
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
        "date": 1744197278915,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30438,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18454,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9399,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 11073,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 13299,
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
          "id": "d5ce03a70b54516a2f3323e95d0878572f63f563",
          "message": "fix: check genesis state before starting node (#13121)\n\nThis PR adds a check that the computed genesis state matches the\nrollup's and refuses to start if there's a mismatch:\n\nExample of it in action: (I previously deployed a rollup without test\naccounts)\n```\nt % export TEST_ACCOUNTS=true\nt % node aztec/dest/bin/index.js start --node --archiver\nInitial funded accounts: 0x28491b8467212d92f515f389a39f1feddcd22dd07d6dbf60a2f162a213746c90, 0x235b767f653b46347246207d9f6dcc199b9204388e76be129e1bb1e57f43cab7, 0x041fc27e559aace70b414b6dfa4a70dc5933aa045afba8e100ec63f31d0fc88b                                                                                                                                                            Genesis block hash: 0x10d6c0bd1f44fdde380fa846ab63ca943f74e567b916774fe1855fcf2f41b105\nGenesis archive root: 0x1ef48c132277b9b2a9b348c763d2f281b4f3d08baa86070fc3a461507bd74ca6\n[10:59:45.136] WARN: foundation:version-manager Rollup or tag has changed, resetting data directory {\"versionFile\":\"/tmp/aztec-world-state-xZNypg/world_state/db_version\",\"storedVersion\":{\"schemaVersion\":0,\"rollupAddress\":\"0x0000000000000000000000000000000000000000\",\"tag\":\"\"},\"currentVersion\":{\"schemaVersion\":1,\"rollupAddress\":\"0x0000000000000000000000000000000000000000\",\"tag\":\"genesisArchiveTreeRoot:0x0000000000000000000000000000000000000000000000000000000000000000\"}}\n[10:59:45.159] INFO: world-state:database Creating world state data store at directory /tmp/aztec-world-state-xZNypg/world_state with map size 10485760 KB and 16 threads.\n[10:59:45.558] ERROR: cli Error in command execution\n[10:59:45.559] ERROR: cli Error: The computed genesis archive tree root 0x1ef48c132277b9b2a9b348c763d2f281b4f3d08baa86070fc3a461507bd74ca6 does not match the expected genesis archive tree root 0x0237797d6a2c04d20d4fa06b74482bd970ccd51a43d9b05b57e9b91fa1ae1cae for the rollup deployed at 0x0b306bf915c4d645ff596e518faf3f9669b97016\nError: The computed genesis archive tree root 0x1ef48c132277b9b2a9b348c763d2f281b4f3d08baa86070fc3a461507bd74ca6 does not match the expected genesis archive tree root 0x0237797d6a2c04d20d4fa06b74482bd970ccd51a43d9b05b57e9b91fa1ae1cae for the rollup deployed at 0x0b306bf915c4d645ff596e518faf3f9669b97016\n    at startNode (file:///mnt/user-data/alexg/code/aztec-packages/alpha/yarn-project/aztec/dest/cli/cmds/start_node.js:63:19)\n```\n\nFix #13020",
          "timestamp": "2025-04-09T11:29:55Z",
          "tree_id": "03ccf1f3be43bc4901ec3654c1450f86d3f74805",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d5ce03a70b54516a2f3323e95d0878572f63f563"
        },
        "date": 1744200904047,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30028,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17894,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9276,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10828,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12771,
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