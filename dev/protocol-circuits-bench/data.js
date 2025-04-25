window.BENCHMARK_DATA = {
  "lastUpdate": 1745620985988,
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
      }
    ]
  }
}