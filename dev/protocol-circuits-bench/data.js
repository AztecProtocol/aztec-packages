window.BENCHMARK_DATA = {
  "lastUpdate": 1746042686209,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "Protocol Circuit Gate Counts": [
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
          "id": "095b032ea6cea72cfdd78e05f8badff9158a78fd",
          "message": "chore: provide hash function in `noir-protocol-circuits` (#13857)\n\nThis fixes `./ci.sh gh-bench` as it's trying to call the `hash` function\nwithin `noir-protocol-circuits` which doesn't exist.\n\n---------\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-04-25T21:40:34Z",
          "tree_id": "435dea1ef73ba571f1b125f79f706a82621562ab",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/095b032ea6cea72cfdd78e05f8badff9158a78fd"
        },
        "date": 1745620977315,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2937926,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 40826,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 79409,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 617669,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50068,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94447,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 268780,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257210,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 199945,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187504,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 182818,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 193815,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189128,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 198776,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 209774,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205087,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 143537,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 138851,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 149848,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145161,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 154809,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 165807,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161120,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 340787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 145666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 140980,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 151977,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 161625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 156938,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 167936,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163249,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 101699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97013,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108010,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103323,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 117658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 112971,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 123969,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119282,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94307,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50587,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1973463,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1436711,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1604319,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4712123,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 745944,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3916549,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1528122,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26860473,
            "unit": "gates"
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
          "id": "807b03d09f8effc2553ab7228ec716c44b0f9452",
          "message": "feat: new assert functionality for bb (#13854)\n\nI thought our asserts could use more helpful information to aid\ndebugging time.\n\nExample:\n```\nBB_ASSERT_GT(1, 1, \"false\");\n``` \nproduces:\n```\nAssertion failed: (1 > 1)\n  Left   : 1\n  Right  : 1\n  Reason : false\n```",
          "timestamp": "2025-04-26T00:37:23Z",
          "tree_id": "34214f56bcfd1d375460548c478a9842dd33df17",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/807b03d09f8effc2553ab7228ec716c44b0f9452"
        },
        "date": 1745632800794,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2937926,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 40826,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 79409,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 617669,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50068,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94447,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 268780,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257210,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 199945,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187504,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 182818,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 193815,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189128,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 198776,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 209774,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205087,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 143537,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 138851,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 149848,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145161,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 154809,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 165807,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161120,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 340787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 145666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 140980,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 151977,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 161625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 156938,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 167936,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163249,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 101699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97013,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108010,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103323,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 117658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 112971,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 123969,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119282,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94307,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50587,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1973463,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1436711,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1604319,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4712123,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 745944,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3916549,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1528122,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26860473,
            "unit": "gates"
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
          "id": "4c9da5b8b495cb6c60916fd4a8a7625776d07d2d",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"e25e53b26e\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"e25e53b26e\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-26T02:29:29Z",
          "tree_id": "d33df4d74b923f81ada5cee6282530ef1b54186b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4c9da5b8b495cb6c60916fd4a8a7625776d07d2d"
        },
        "date": 1745636815552,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2937926,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 40826,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 79409,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 617669,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50068,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94447,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 268780,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257210,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 199945,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187504,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 182818,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 193815,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189128,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 198776,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 209774,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205087,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 143537,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 138851,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 149848,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145161,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 154809,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 165807,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161120,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 340787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 145666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 140980,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 151977,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 161625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 156938,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 167936,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163249,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 101699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97013,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108010,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103323,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 117658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 112971,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 123969,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119282,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94307,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50587,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1973463,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1436711,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1604319,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4712123,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 745944,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3916549,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1528122,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26860473,
            "unit": "gates"
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
          "id": "a1f94c3a1c244834601e3048953cad9047c69835",
          "message": "fix: constrain proposed block header (#13693)\n\nhttps://github.com/AztecProtocol/aztec-packages/issues/12928",
          "timestamp": "2025-04-27T10:17:45Z",
          "tree_id": "4799da36a80154e1074c65667dd6b5a7d18f3968",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a1f94c3a1c244834601e3048953cad9047c69835"
        },
        "date": 1745752553824,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2937926,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 40826,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 79409,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 617669,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50068,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94447,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 268780,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257210,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 199945,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187504,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 182818,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 193815,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189128,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 198776,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 209774,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205087,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 143537,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 138851,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 149848,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145161,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 154809,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 165807,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161120,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 340787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 145666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 140980,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 151977,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 161625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 156938,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 167936,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163249,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 101699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97013,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108010,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103323,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 117658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 112971,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 123969,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119282,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94307,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50587,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1973463,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1436711,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1608342,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4741642,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 773706,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3946075,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1528122,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26864498,
            "unit": "gates"
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
          "id": "30798fecbae400e5c129fc000fa482ef8302aecd",
          "message": "feat(alpha-testnet): https full node (#13819)\n\nAdds an optional static fullnode ip\nAdded a route53 record on aztec.network domain\n\nthis is up and running and applied in the alpha-testnet namespace",
          "timestamp": "2025-04-28T09:09:28Z",
          "tree_id": "73247f1a0c4a1efbf0af2e6ffdc1910c3f60f76e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/30798fecbae400e5c129fc000fa482ef8302aecd"
        },
        "date": 1745834872041,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2937926,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 40826,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 79409,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 617669,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50068,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94447,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 268780,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257210,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 199945,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187504,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 182818,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 193815,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189128,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 198776,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 209774,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205087,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 143537,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 138851,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 149848,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145161,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 154809,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 165807,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161120,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 340787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 145666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 140980,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 151977,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 161625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 156938,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 167936,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163249,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 101699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97013,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108010,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103323,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 117658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 112971,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 123969,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119282,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94307,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50587,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1973463,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1436711,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1608342,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4741642,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 773706,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3946075,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1528122,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26864498,
            "unit": "gates"
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
          "id": "d0dccf50800b33605b7525cc31b171ff434ab1d8",
          "message": "fix: aztec test args not being parsed correctly (#13866)\n\nFrom Zorzal:\n\nLOG_LEVEL=debug aztec test mint_to_private_s --show-output\nDid not work (specifically passing a test name and --show-output)\n\nThis fixes that",
          "timestamp": "2025-04-29T07:26:51Z",
          "tree_id": "ef3577a9d28b4aa2a09160f72a1de6327cd9927a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d0dccf50800b33605b7525cc31b171ff434ab1d8"
        },
        "date": 1745914864470,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2937926,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 40823,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 79409,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 617669,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50068,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94447,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 268780,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257210,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 199945,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187504,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 182818,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 193815,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189128,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 198776,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 209774,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205087,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 143537,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 138851,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 149848,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145161,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 154809,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 165807,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161120,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 340787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 145666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 140980,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 151977,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 161625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 156938,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 167936,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163249,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 101699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97013,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108010,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103323,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 117658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 112971,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 123969,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119282,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94307,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50587,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1973462,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1436711,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1608330,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4753923,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 773706,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3958356,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1528122,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26864486,
            "unit": "gates"
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
          "id": "0680de45a51cc119f3cd27c6ff6befb098d1354f",
          "message": "chore(sol): update master gas benchmark (#13890)\n\n## Overview\n\nUpdating to make comparisons on my branch accurate",
          "timestamp": "2025-04-29T10:49:31Z",
          "tree_id": "7c67631c59329e0c848545173d211a7465bc14b7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0680de45a51cc119f3cd27c6ff6befb098d1354f"
        },
        "date": 1745927099577,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2937926,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 40823,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 79409,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 617669,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50068,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94447,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 268780,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257210,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 199945,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187504,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 182818,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 193815,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189128,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 198776,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 209774,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205087,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 143537,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 138851,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 149848,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145161,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 154809,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 165807,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161120,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 340787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 145666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 140980,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 151977,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 161625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 156938,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 167936,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163249,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 101699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97013,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108010,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103323,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 117658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 112971,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 123969,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119282,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94307,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50587,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1973462,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1436711,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1608330,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4753923,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 773706,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3958356,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1528122,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26864486,
            "unit": "gates"
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
          "id": "373295fcd6fbdbeb2fe57c3463e98ef6917dea26",
          "message": "chore: assign `arb_program_can_be_executed` flake to Akosh (#13919)\n\nCharlie alerted me to this test being flakey. @aakoshh it looks like you\nadded this test, can you take a look at this and fix the flakiness?",
          "timestamp": "2025-04-29T14:52:04+01:00",
          "tree_id": "32d88ae95931439643fe9e5721bda9e2551cb987",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/373295fcd6fbdbeb2fe57c3463e98ef6917dea26"
        },
        "date": 1745936399910,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2937926,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 40823,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 79409,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 617669,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50068,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94447,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 268780,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257210,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 199945,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187504,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 182818,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 193815,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189128,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 198776,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 209774,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205087,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 143537,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 138851,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 149848,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145161,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 154809,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 165807,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161120,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 340787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 145666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 140980,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 151977,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 161625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 156938,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 167936,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163249,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 101699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97013,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108010,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103323,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 117658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 112971,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 123969,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119282,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94307,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50587,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1973462,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1436711,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1608330,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4753923,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 773706,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3958356,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1528122,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26864486,
            "unit": "gates"
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
          "id": "e5af57cfc9358b59f59fa6b2372150fe2dd80fd0",
          "message": "fix: test cache was always disabled (#13922)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-04-29T14:56:46+01:00",
          "tree_id": "ef5db8f8ace2130b0d9c7b308223834dda1015a3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e5af57cfc9358b59f59fa6b2372150fe2dd80fd0"
        },
        "date": 1745937102963,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2937926,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 40823,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 79409,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 617669,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50068,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94447,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 268780,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257210,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 199945,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187504,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 182818,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 193815,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189128,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 198776,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 209774,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205087,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 143537,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 138851,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 149848,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145161,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 154809,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 165807,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161120,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 340787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 145666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 140980,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 151977,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 161625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 156938,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 167936,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163249,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 101699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97013,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108010,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103323,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 117658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 112971,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 123969,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119282,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94307,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50587,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1973462,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1436711,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1608330,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4753923,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 773706,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3958356,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1528122,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26864486,
            "unit": "gates"
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
          "id": "8307bc7454144f84c7f37e523ce241242ad25b84",
          "message": "chore: More validators for alpha (#13908)\n\nThis PR simply creates a deployment containing more validators for\nalpha-testnet.",
          "timestamp": "2025-04-29T14:59:21Z",
          "tree_id": "979d4ebb6b20f816688592fe2956ab32723d7882",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8307bc7454144f84c7f37e523ce241242ad25b84"
        },
        "date": 1745942140390,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2937926,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 40823,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 79409,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 617669,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50068,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94447,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 268780,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257210,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 199945,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187504,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 182818,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 193815,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189128,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 198776,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 209774,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205087,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 143537,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 138851,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 149848,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145161,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 154809,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 165807,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161120,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 340787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 145666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 140980,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 151977,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 161625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 156938,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 167936,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163249,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 101699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97013,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108010,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103323,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 117658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 112971,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 123969,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119282,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94307,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50587,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1973462,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1436711,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1608330,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4753923,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 773706,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3958356,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1528122,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26864486,
            "unit": "gates"
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
          "id": "6e3e494a1698d07145ff5abea0ea951889d118f0",
          "message": "chore: bump noir commit (#13930)\n\nThis should address #13921\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-04-29T16:44:09Z",
          "tree_id": "30df15a0eed2dc830783c1569bc65f155cf6b393",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6e3e494a1698d07145ff5abea0ea951889d118f0"
        },
        "date": 1745948387635,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2937926,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 40823,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 79409,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 617669,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50068,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94447,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 268780,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257210,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 199945,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187504,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 182818,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 193815,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189128,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 198776,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 209774,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205087,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 143537,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 138851,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 149848,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145161,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 154809,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 165807,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161120,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 340787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 145666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 140980,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 151977,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 161625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 156938,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 167936,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163249,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 101699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97013,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108010,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103323,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 117658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 112971,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 123969,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119282,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94307,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50587,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1967404,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1430653,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1608330,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4753904,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 773706,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3958337,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1528122,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26864486,
            "unit": "gates"
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
          "id": "5e3f764da31fb2e9db87d8d0d15113d6e7372600",
          "message": "chore: Reduce consumption on masternet (#13934)\n\nThis PR reduces tx througput on masternet to save resources.",
          "timestamp": "2025-04-29T17:34:08Z",
          "tree_id": "839d4a912661ec0081eef953df2da1ca55112855",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5e3f764da31fb2e9db87d8d0d15113d6e7372600"
        },
        "date": 1745950449759,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2937926,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 40823,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 79409,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 617669,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50068,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94447,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 268780,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257210,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 199945,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187504,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 182818,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 193815,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189128,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 198776,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 209774,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205087,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 143537,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 138851,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 149848,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145161,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 154809,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 165807,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161120,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 340787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 145666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 140980,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 151977,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 161625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 156938,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 167936,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163249,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 101699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97013,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108010,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103323,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 117658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 112971,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 123969,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119282,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94307,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50587,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1967404,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1430653,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1608330,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4753904,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 773706,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3958337,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1528122,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26864486,
            "unit": "gates"
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
          "id": "7250d7b50058dfb13fbc6e82b0ad656e40932095",
          "message": "chore: make private state variables take a single slot, remove special-casin… (#13859)\n\nInstead of special-casing notes to use a single slot, now private state\nvariables simply allocate just one. This means that notes can be stored\nin public correctly (which is a bit weird but w/e - at least they won't\nwreck the layout).\n\n---------\n\nCo-authored-by: Jan Beneš <janbenes1234@gmail.com>",
          "timestamp": "2025-04-29T18:59:36Z",
          "tree_id": "22d7d912a4b2284b3421239585827571418da2f8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7250d7b50058dfb13fbc6e82b0ad656e40932095"
        },
        "date": 1745956177096,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2937926,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 40823,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 79409,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 617669,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50068,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94447,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 268780,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257210,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 199945,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187504,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 182818,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 193815,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189128,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 198776,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 209774,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205087,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 143537,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 138851,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 149848,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145161,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 154809,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 165807,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161120,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 340787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 145666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 140980,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 151977,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 161625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 156938,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 167936,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163249,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 101699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97013,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108010,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103323,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 117658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 112971,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 123969,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119282,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94307,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50587,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1967404,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1430653,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1608330,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4753904,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 773706,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3958337,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1528122,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26864486,
            "unit": "gates"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "michaeljklein@users.noreply.github.com",
            "name": "Michael J Klein",
            "username": "michaeljklein"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "d5d2d140ed85c86703c8a2563ad44e901cec1cc6",
          "message": "chore: enable --pedantic-solving for all tests with nargo (#11224)\n\nThis PR is a continuation of [this PR in\nNoir](https://github.com/noir-lang/noir/pull/6716) which enables\n`--pedantic-solving` in all tests that use `nargo`, including some I\nmissed in `noir`.\n\n---------\n\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2025-04-29T19:21:29Z",
          "tree_id": "233d1a1ea02d7779108b6111558dc4611fadfd52",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d5d2d140ed85c86703c8a2563ad44e901cec1cc6"
        },
        "date": 1745957349601,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2937926,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 40823,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 79409,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 617669,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50068,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94447,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 268780,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257210,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 199945,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187504,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 182818,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 193815,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189128,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 198776,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 209774,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205087,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 143537,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 138851,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 149848,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145161,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 154809,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 165807,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161120,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 340787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 145666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 140980,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 151977,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 161625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 156938,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 167936,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163249,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 101699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97013,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108010,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103323,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 117658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 112971,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 123969,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119282,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94307,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50587,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1967404,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1430653,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1608330,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4753904,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 773706,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3958337,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1528122,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26864486,
            "unit": "gates"
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
          "id": "9937baab3e66921d78b1f729baa9d62e850fad52",
          "message": "feat(docs): Tiny tutorial structure change (#13793)",
          "timestamp": "2025-04-29T20:04:35Z",
          "tree_id": "ee72357004682a8820154b7875720d7b0ef3cc48",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9937baab3e66921d78b1f729baa9d62e850fad52"
        },
        "date": 1745959604086,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2937926,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 40823,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 79409,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 617669,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50068,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94447,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 268780,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257210,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 199945,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187504,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 182818,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 193815,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189128,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 198776,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 209774,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205087,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 143537,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 138851,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 149848,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145161,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 154809,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 165807,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161120,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 340787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 145666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 140980,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 151977,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 161625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 156938,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 167936,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163249,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 101699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97013,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108010,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103323,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 117658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 112971,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 123969,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119282,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94307,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50587,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1967404,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1430653,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1608330,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4753904,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 773706,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3958337,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1528122,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26864486,
            "unit": "gates"
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
          "id": "80e8afec22db049f304508d9adeaf74b56d9d1eb",
          "message": "fix: retry noir install deps (#13936)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-04-29T22:31:35Z",
          "tree_id": "0d1b0ba9567828567ea19782c11ff007da0d2ef8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/80e8afec22db049f304508d9adeaf74b56d9d1eb"
        },
        "date": 1745968775903,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2937926,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 40823,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 79409,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 617669,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50068,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94447,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 268780,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257210,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 199945,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187504,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 182818,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 193815,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189128,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 198776,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 209774,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205087,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 143537,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 138851,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 149848,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145161,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 154809,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 165807,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161120,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 340787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 145666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 140980,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 151977,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 161625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 156938,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 167936,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163249,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 101699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97013,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108010,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103323,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 117658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 112971,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 123969,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119282,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94307,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50587,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1967404,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1430653,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1608330,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4753904,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 773706,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3958337,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1528122,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26864486,
            "unit": "gates"
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
          "id": "001a3403792ec424893df45a3683d49c53794827",
          "message": "fix: Restart archiver loop if L1 block falls more than 128 blocks behind (#13602)\n\nIf the `currentL1Block` used in the archiver sync loop falls more than\n128 blocks behind (eg during a very long sync), then `eth_call`\noperations that pin the block number (`status`, `canPrune`) may end up\nquerying a block evicted by a non-archive node. If this happens, we just\nabort the current sync and restart. This should not evict any messages\nor blocks already downloaded.\n\nFixes #13596",
          "timestamp": "2025-04-29T22:38:45Z",
          "tree_id": "55a5b92b965ea176ecb063901641efbfb1a6a2d7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/001a3403792ec424893df45a3683d49c53794827"
        },
        "date": 1745969109316,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2937926,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 40823,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 79409,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 617669,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50068,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94447,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 268780,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257210,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 199945,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187504,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 182818,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 193815,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189128,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 198776,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 209774,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205087,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 143537,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 138851,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 149848,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145161,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 154809,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 165807,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161120,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 340787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 145666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 140980,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 151977,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 161625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 156938,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 167936,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163249,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 101699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97013,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108010,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103323,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 117658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 112971,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 123969,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119282,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94307,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50587,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1967404,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1430653,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1608330,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4753904,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 773706,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3958337,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1528122,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26864486,
            "unit": "gates"
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
          "id": "2a9dd4487986ae16f03238144c5d4c9a3412bc08",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"db8ad4da6e\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"db8ad4da6e\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-30T02:31:10Z",
          "tree_id": "111667e5daca579144c4e483fb9ed6758f2c9f9b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2a9dd4487986ae16f03238144c5d4c9a3412bc08"
        },
        "date": 1745982443781,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2937926,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 40823,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 79409,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 617669,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50068,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94447,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 268780,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257210,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 199945,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187504,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 182818,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 193815,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189128,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 198776,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 209774,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205087,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 143537,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 138851,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 149848,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145161,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 154809,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 165807,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161120,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 340787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 145666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 140980,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 151977,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 161625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 156938,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 167936,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163249,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 101699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97013,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108010,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103323,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 117658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 112971,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 123969,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119282,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94307,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50587,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1967404,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1430653,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1608330,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4753904,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 773706,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3958337,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1528122,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26864486,
            "unit": "gates"
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
          "id": "f65674dce7b631dba1494782aebd460cead6884c",
          "message": "fix: Cl/p2p ports (#13943)\n\nMove the e2e_p2p ports out of the \"ephemeral range\" to see if resolves\nthe network bind issue.\nFix precommit hook which didn't error when it should.",
          "timestamp": "2025-04-30T08:10:18Z",
          "tree_id": "1faeeed51783c94a59fa7514fec70cb324cb6928",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f65674dce7b631dba1494782aebd460cead6884c"
        },
        "date": 1746003264645,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2937926,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 40823,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 79409,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 617669,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50068,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94447,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 268780,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257210,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 199945,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187504,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 182818,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 193815,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189128,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 198776,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 209774,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205087,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 143537,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 138851,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 149848,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145161,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 154809,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 165807,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161120,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 340787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 145666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 140980,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 151977,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 161625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 156938,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 167936,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163249,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 101699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97013,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108010,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103323,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 117658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 112971,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 123969,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119282,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94307,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50587,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1967404,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1430653,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1608330,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4753904,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 773706,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3958337,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1528122,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26864486,
            "unit": "gates"
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
          "id": "2ad6803bf8f830a6e4c76f3b4657889ec85d8e2c",
          "message": "chore: log which civc final circuit fails to verify (#13939)",
          "timestamp": "2025-04-30T08:11:57Z",
          "tree_id": "e7ce33f1bc7196d802ba89623b10d7f5c8c0b95b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2ad6803bf8f830a6e4c76f3b4657889ec85d8e2c"
        },
        "date": 1746003284212,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2937926,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 40823,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 79409,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 617669,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50068,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94447,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 268780,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257210,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 199945,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187504,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 182818,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 193815,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189128,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 198776,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 209774,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205087,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 143537,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 138851,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 149848,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145161,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 154809,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 165807,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161120,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 340787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 145666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 140980,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 151977,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 161625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 156938,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 167936,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163249,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 101699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97013,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108010,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103323,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 117658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 112971,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 123969,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119282,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94307,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50587,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1967404,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1430653,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1608330,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4753904,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 773706,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3958337,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1528122,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26864486,
            "unit": "gates"
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
          "id": "e3798106bc21b035f3631908355ff752f8fad1c9",
          "message": "chore: bump retries for request tx by hash (#13675)\n\n## Overview\n\nWith better sampling logic, we can more safetly bump the retries for the\ntx requests",
          "timestamp": "2025-04-30T09:43:30Z",
          "tree_id": "911fa7579ce86743b7bed1b203bb9d4682f40790",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e3798106bc21b035f3631908355ff752f8fad1c9"
        },
        "date": 1746009375872,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2937926,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 40823,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 79409,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 617669,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50068,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94447,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 268780,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257210,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 199945,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187504,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 182818,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 193815,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189128,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 198776,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 209774,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205087,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 143537,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 138851,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 149848,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145161,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 154809,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 165807,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161120,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 340787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 145666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 140980,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 151977,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 161625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 156938,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 167936,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163249,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 101699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97013,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108010,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103323,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 117658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 112971,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 123969,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119282,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94307,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50587,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1967404,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1430653,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1608330,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4753904,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 773706,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3958337,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1528122,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26864486,
            "unit": "gates"
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
          "id": "24e023616cbbf9a299ba0e3eae90077cb5b34cd9",
          "message": "chore: deprecate master version in aztec-up (#13937)\n\nWe don't publish master images anymore and this results in users\ninstalling a stale 2 months old version when they install with\n`VERSION=master aztec-up`. In this PR I prevent this by throwing an\nerror when they attempt to use the master version.\n\nFixes #13275",
          "timestamp": "2025-04-30T11:50:51Z",
          "tree_id": "0d80ca2e1ad0426171449b5edd68f65d049dd566",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/24e023616cbbf9a299ba0e3eae90077cb5b34cd9"
        },
        "date": 1746016449385,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2937926,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 40823,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 79409,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 617669,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50068,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94447,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 268780,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257210,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 199945,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187504,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 182818,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 193815,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189128,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 198776,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 209774,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205087,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 143537,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 138851,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 149848,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145161,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 154809,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 165807,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161120,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 340787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 145666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 140980,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 151977,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 161625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 156938,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 167936,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163249,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 101699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97013,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108010,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103323,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 117658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 112971,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 123969,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119282,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94307,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50587,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1967404,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1430653,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1608330,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4753904,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 773706,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3958337,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1528122,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26864486,
            "unit": "gates"
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
          "id": "0d9085f2fcecd82374af846b7497ac3067921494",
          "message": "chore: update proving cost changes (#13833)\n\nFixes #13600. \n\n\nAccompanying update tohe engineering design in\nhttps://github.com/AztecProtocol/engineering-designs/pull/59\n\nThe diff looks very large, but is mostly because we generated a new\nfixture structure.",
          "timestamp": "2025-04-30T12:13:04Z",
          "tree_id": "56fbb3ec7ae5a6368ddf0b3b8efc47912893596d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0d9085f2fcecd82374af846b7497ac3067921494"
        },
        "date": 1746017986117,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2937926,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 40823,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 79409,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 617669,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50068,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94447,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 268780,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257210,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 199945,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187504,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 182818,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 193815,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189128,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 198776,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 209774,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205087,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 143537,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 138851,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 149848,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145161,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 154809,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 165807,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161120,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 340787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 145666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 140980,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 151977,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 161625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 156938,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 167936,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163249,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 101699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97013,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108010,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103323,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 117658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 112971,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 123969,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119282,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94307,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50587,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1967404,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1430653,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1608330,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4753904,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 773706,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3958337,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1528122,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26864486,
            "unit": "gates"
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
          "id": "ef6bb21a1cf63280383e93c5304884fe51087dd8",
          "message": "feat: P2P requests txs from mined unproven blocks (#13941)\n\nThis should help mined txs to be spread through the p2p network, so\nprovers have a better chance to get them.",
          "timestamp": "2025-04-30T12:57:23Z",
          "tree_id": "e3ff76039853148bda4514a9661b921b6b48b20e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ef6bb21a1cf63280383e93c5304884fe51087dd8"
        },
        "date": 1746020525960,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2937926,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 40823,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 79409,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 617669,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50068,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94447,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 268780,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257210,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 199945,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187504,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 182818,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 193815,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189128,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 198776,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 209774,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205087,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 143537,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 138851,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 149848,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145161,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 154809,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 165807,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161120,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 340787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 145666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 140980,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 151977,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 161625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 156938,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 167936,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163249,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 101699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97013,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108010,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103323,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 117658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 112971,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 123969,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119282,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94307,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50587,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1967404,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1430653,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1608330,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4753904,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 773706,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3958337,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1528122,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26864486,
            "unit": "gates"
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
          "id": "b29c067571ef178f7eca62e27fbcb4e2407bf15a",
          "message": "rm breaking acir tests",
          "timestamp": "2025-04-30T13:58:04Z",
          "tree_id": "c36028cae648e581f2a553c9c2fa78a13b4bbfdf",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b29c067571ef178f7eca62e27fbcb4e2407bf15a"
        },
        "date": 1746022435175,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2937926,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 40823,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 79409,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 617669,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50068,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94447,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 268780,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257210,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 199945,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187504,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 182818,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 193815,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189128,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 198776,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 209774,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205087,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 143537,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 138851,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 149848,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145161,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 154809,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 165807,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161120,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 340787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 145666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 140980,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 151977,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 161625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 156938,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 167936,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163249,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 101699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97013,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108010,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103323,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 117658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 112971,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 123969,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119282,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94307,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50587,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1967404,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1430653,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1608330,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4753904,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 773706,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3958337,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1528122,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26864486,
            "unit": "gates"
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
          "id": "48cfcfe56ea6cca4bf6de138079b9ff7c89d30ec",
          "message": "refactor: use open zeppelin library (#13952)\n\nFixes #13873.\n\nReplaces most of the custom things in the `UserLib` with the open\nzeppelin checkpoint library. Still let the `UserLib` exist because the\n`add` and `sub` makes logic makes it simpler to use, and more plug and\nplay (also expect to be able to reuse it later).\n\n⚠️ Uses `uint32` for timestamps ⚠️",
          "timestamp": "2025-04-30T13:26:03Z",
          "tree_id": "c519d38515b3b6e5537ff0fed38ef8e0c9e99dc0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/48cfcfe56ea6cca4bf6de138079b9ff7c89d30ec"
        },
        "date": 1746026371595,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2937926,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 40823,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 79409,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 617669,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50068,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94447,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 268780,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257210,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 199945,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187504,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 182818,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 193815,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189128,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 198776,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 209774,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205087,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 143537,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 138851,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 149848,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145161,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 154809,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 165807,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161120,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 340787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 145666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 140980,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 151977,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 161625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 156938,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 167936,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163249,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 101699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97013,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108010,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103323,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 117658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 112971,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 123969,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119282,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94307,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 35868,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50587,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1967404,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1430653,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1608330,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4753904,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 773706,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3958337,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1528122,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26864486,
            "unit": "gates"
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
          "id": "8e83b22f4b187b2d09eb28118c6fccb4de914c52",
          "message": "fix: generate recursion separator properly (#13931)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/995.\n\nInstead of setting the recursion separator to 42, we generate it by\nhashing the two input pairing point objects.",
          "timestamp": "2025-04-30T14:28:18Z",
          "tree_id": "87734d936afc18d82d3822c39bc02781bbfbf360",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8e83b22f4b187b2d09eb28118c6fccb4de914c52"
        },
        "date": 1746026443198,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 618152,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94930,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200428,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189611,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203946,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199259,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210257,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205570,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144020,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139334,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150331,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145644,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159979,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155292,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161603,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341270,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146149,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152460,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147773,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162108,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157421,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168419,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163732,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102182,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108493,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103806,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118141,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113454,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124452,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119765,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94790,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 51070,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968403,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431652,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1610326,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866482,
            "unit": "gates"
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
          "id": "f24d32326786f9a2c89520babf08e8e17f50bc2a",
          "message": "fix: Missing try/catch when requesting txs for unproven blocks (#13957)\n\nGiven the promise was not awaited to avoid blocking, an error there\nwould mean the node failing with an uncaught promise rejection.",
          "timestamp": "2025-04-30T14:37:37Z",
          "tree_id": "9797146046117410e4be65610d1007775f83d6de",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f24d32326786f9a2c89520babf08e8e17f50bc2a"
        },
        "date": 1746026671334,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 618152,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94930,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200428,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189611,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203946,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199259,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210257,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205570,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144020,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139334,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150331,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145644,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159979,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155292,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161603,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341270,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146149,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152460,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147773,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162108,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157421,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168419,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163732,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102182,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108493,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103806,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118141,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113454,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124452,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119765,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94790,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 51070,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968403,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431652,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1610326,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866482,
            "unit": "gates"
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
          "id": "727664beeda8355bc3a467676bc4234c077810f7",
          "message": "chore: Do not sync attestations to the p2p pool (#13926)\n\nFixes #13923",
          "timestamp": "2025-04-30T14:39:37Z",
          "tree_id": "75ce23839468413901c6c5ca34227be5f1592aab",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/727664beeda8355bc3a467676bc4234c077810f7"
        },
        "date": 1746026775690,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 618152,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94930,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200428,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189611,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203946,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199259,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210257,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205570,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144020,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139334,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150331,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145644,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159979,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155292,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161603,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341270,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146149,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152460,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147773,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162108,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157421,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168419,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163732,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102182,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108493,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103806,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118141,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113454,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124452,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119765,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94790,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 51070,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968403,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431652,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1610326,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866482,
            "unit": "gates"
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
          "id": "60d76f5bd4ef603c207937025f45ae32f92398ed",
          "message": "fix: add flake. propogate CPUS/MEM env vars into containers. (#13959)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-04-30T15:27:56Z",
          "tree_id": "b38a3e4fc634d2a8b060e0453b58d22dd95365d9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/60d76f5bd4ef603c207937025f45ae32f92398ed"
        },
        "date": 1746029053169,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 618152,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94930,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200428,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189611,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203946,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199259,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210257,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205570,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144020,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139334,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150331,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145644,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159979,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155292,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161603,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341270,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146149,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152460,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147773,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162108,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157421,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168419,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163732,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102182,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108493,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103806,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118141,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113454,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124452,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119765,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94790,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 51070,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968403,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431652,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1610326,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866482,
            "unit": "gates"
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
          "id": "dcdc92a42e333b3e2def3a3a3f20a9f4c9d1bf27",
          "message": "feat!: change ret/rev operands (#13960)\n\nChanges RET/REV operands from `(data_offset, size_offset)` to\n`(size_offset, data_offset)`",
          "timestamp": "2025-04-30T15:33:47Z",
          "tree_id": "aac652447ccc0ebc4edebc310a67ed066c784ba1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/dcdc92a42e333b3e2def3a3a3f20a9f4c9d1bf27"
        },
        "date": 1746029795282,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 618152,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94930,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200428,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189611,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203946,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199259,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210257,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205570,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144020,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139334,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150331,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145644,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159979,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155292,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161603,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341270,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146149,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152460,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147773,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162108,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157421,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168419,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163732,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102182,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108493,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103806,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118141,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113454,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124452,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119765,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94790,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 51070,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968403,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431652,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1610326,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866482,
            "unit": "gates"
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
          "id": "b051b29dc310924c086bf91b59c021981853b48d",
          "message": "fix: docs cache (#13963)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.\n\n---------\n\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2025-04-30T15:33:30Z",
          "tree_id": "f42eff33fee4824ee678b0384ec5a75ad7ee6c90",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b051b29dc310924c086bf91b59c021981853b48d"
        },
        "date": 1746029866849,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 618152,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94930,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200428,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189611,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203946,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199259,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210257,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205570,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144020,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139334,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150331,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145644,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159979,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155292,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161603,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341270,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146149,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152460,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147773,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162108,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157421,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168419,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163732,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102182,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108493,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103806,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118141,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113454,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124452,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119765,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94790,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 51070,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968403,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431652,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1610326,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866482,
            "unit": "gates"
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
          "id": "7e95820806bf5a010a5ac59d78b21989daefde22",
          "message": "chore: Enable l1 reorg e2e test on CI (#13944)\n\nI forgot to include it (again).",
          "timestamp": "2025-04-30T15:50:56Z",
          "tree_id": "ae2897ad17afa3545ffc685ed2bcbe0d41ecdeaf",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7e95820806bf5a010a5ac59d78b21989daefde22"
        },
        "date": 1746031186315,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 618152,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94930,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200428,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189611,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203946,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199259,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210257,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205570,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144020,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139334,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150331,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145644,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159979,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155292,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161603,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341270,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146149,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152460,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147773,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162108,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157421,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168419,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163732,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102182,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108493,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103806,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118141,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113454,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124452,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119765,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94790,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 51070,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968403,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431652,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1610326,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866482,
            "unit": "gates"
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
          "id": "3b1e34ebfc7cb0af03779bd67128e42aa4654a40",
          "message": "chore!: remove all access to plonk via bberg interfaces (#13902)\n\nEffectively remove plonk from all bberg interfaces in preparation to\nremove it from the codebase entirely.",
          "timestamp": "2025-04-30T16:34:37Z",
          "tree_id": "9134d90eaf18477f57742edb9dd6e5337fb26ad3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3b1e34ebfc7cb0af03779bd67128e42aa4654a40"
        },
        "date": 1746035169316,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 618152,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94930,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200428,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189611,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203946,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199259,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210257,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205570,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144020,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139334,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150331,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145644,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159979,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155292,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161603,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341270,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146149,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152460,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147773,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162108,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157421,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168419,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163732,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102182,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108493,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103806,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118141,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113454,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124452,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119765,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94790,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 51070,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968403,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431652,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1610326,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866482,
            "unit": "gates"
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
          "id": "2a0fb838b3b9111a3f68c2034203320505561963",
          "message": "feat: hide Translator accumulated_result  (#13792)\n\n`TranslatorCircuitBuilder` is responsible for computing the evaluation\nat some challenge `x` of a batched polynomial derived from the `UltraOp`\nversion of the op_queue. This value gets sent to the\n`TranslatorVerifier` as part of the proof and hence needs to not leak\ninformation about the actual ops (explained in more detail as a comments\nin the code). The PR resolves issue\nhttps://github.com/AztecProtocol/barretenberg/issues/1368 and also\nremoves some left over ops that were just avoiding point at infinity\nissues and are not necessary anymore.",
          "timestamp": "2025-04-30T18:23:33Z",
          "tree_id": "3676832977e6cae6ad323a1484df92d4f11eb5a9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2a0fb838b3b9111a3f68c2034203320505561963"
        },
        "date": 1746041607652,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 618152,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94930,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200428,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189611,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203946,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199259,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210257,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205570,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144020,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139334,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150331,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145644,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159979,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155292,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161603,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341270,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146149,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152460,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147773,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162108,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157421,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168419,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163732,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102182,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108493,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103806,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118141,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113454,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124452,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119765,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94790,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 51070,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968403,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431652,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1610326,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866482,
            "unit": "gates"
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
          "id": "39e9b261a16957ffdcc44aaaf464e1cdb842830e",
          "message": "feat: testing contract compilation fails as expected (#13896)\n\nIt is desirable to have the ability to test that a given contract fails\nwith a given compilation error. In this PR I introduce\n`noir-projects/noir-contracts-comp-failures` directory in which a\ncontract package can be defined along with the expected error message\nand then in the bootstrap.sh script the contracts are compiled and the\noutput is checked to contain a given error.\n\nThe compilation failure check is being run in CI and I verified that it\nfails as expected when the error does not match. Did that in [this\nrun](https://github.com/AztecProtocol/aztec-packages/actions/runs/14740278893/job/41376379014):\n<img width=\"624\" alt=\"image\"\nsrc=\"https://github.com/user-attachments/assets/a4cbe6be-4421-4bf3-87c4-1f7cacce90c1\"\n/>\n\nThe plan is to test more comp failures in followup PRs.",
          "timestamp": "2025-04-30T18:39:48Z",
          "tree_id": "d074de5b3a2bfc2771fa6405dd9dca7251279a86",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/39e9b261a16957ffdcc44aaaf464e1cdb842830e"
        },
        "date": 1746041906060,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 618152,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94930,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200428,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189611,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203946,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199259,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210257,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205570,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144020,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139334,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150331,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145644,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159979,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155292,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161603,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341270,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146149,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152460,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147773,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162108,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157421,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168419,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163732,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102182,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108493,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103806,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118141,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113454,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124452,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119765,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94790,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 51070,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968403,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431652,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1610326,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866482,
            "unit": "gates"
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
          "id": "897c49b6c3a0d428173275628f1e50fbdad8e42b",
          "message": "feat: github-action-benchmark reporting for public simulation (#13938)\n\nGH pages page is here:\nhttps://aztecprotocol.github.io/aztec-packages/dev/sim-bench/\n\n(I temporarily removed the `if` condition for the ci steps so that\nthey'd generate gh-action-benchmark commits/points for my PR)\n\nAfter seeing the alert below at 110% threshold that I believe was just\ndue to general variability in simulation times, I bumped the alert\nthreshold to 200%. That's kind of a bummer because ideally I'd like to\nget notified if #instructions executed grows by even ~5%, but the\nduration metrics vary more widely from run to run.\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-04-30T19:09:02Z",
          "tree_id": "b1a081012f5fa3e8873a33adade5d5438aafe01f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/897c49b6c3a0d428173275628f1e50fbdad8e42b"
        },
        "date": 1746042678074,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 618152,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 94930,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200428,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 187987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189611,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 203946,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199259,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210257,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205570,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144020,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139334,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150331,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145644,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 159979,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155292,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166290,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161603,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341270,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146149,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141463,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152460,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147773,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162108,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157421,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168419,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163732,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102182,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97496,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108493,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103806,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118141,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113454,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124452,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119765,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94790,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 51070,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968403,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431652,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1610326,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866482,
            "unit": "gates"
          }
        ]
      }
    ]
  }
}