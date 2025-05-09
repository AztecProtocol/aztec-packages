window.BENCHMARK_DATA = {
  "lastUpdate": 1746800665305,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "Protocol Circuit Gate Counts": [
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
          "id": "7012aebf69ed546c3576eb32bad70c88d9cf8400",
          "message": "fix: Error enriching after noir changes (#14080)\n\nUpdates our error enrichment code after the changes in noir to use a\nlocations tree. Partially based on\nhttps://github.com/AztecProtocol/aztec-packages/pull/14016",
          "timestamp": "2025-05-05T16:25:52Z",
          "tree_id": "c8d99d9e28aa5e4c98da06e4aea8d63735f0c4bd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7012aebf69ed546c3576eb32bad70c88d9cf8400"
        },
        "date": 1746464276900,
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
            "value": 91320,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624527,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56032,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263166,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206131,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193523,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211106,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149556,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155866,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151180,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347198,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151685,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 146998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 157995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167643,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162957,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173954,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169268,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107718,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103031,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114028,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109342,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123676,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118990,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100325,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37209,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56276,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
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
            "value": 26866078,
            "unit": "gates"
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
          "id": "775f6f475fe4f9858fcf3bf6879bcf3b61e25720",
          "message": "chore: redo typo PR by gap-editor (#14079)\n\nThanks gap-editor for\nhttps://github.com/AztecProtocol/aztec-packages/pull/14069. Our policy\nis to redo typo changes to dissuade metric farming. This is an automated\nscript.\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-05T17:27:34Z",
          "tree_id": "6d12c662da76a9c9ac5444f18ef886aabe7c9f32",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/775f6f475fe4f9858fcf3bf6879bcf3b61e25720"
        },
        "date": 1746467997951,
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
            "value": 91320,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624527,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56032,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263166,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206131,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193523,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211106,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149556,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155866,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151180,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347198,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151685,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 146998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 157995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167643,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162957,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173954,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169268,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107718,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103031,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114028,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109342,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123676,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118990,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100325,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37209,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56276,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
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
            "value": 26866078,
            "unit": "gates"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "shramee.srivastav@gmail.com",
            "name": "Shramee Srivastav",
            "username": "shramee"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "a1148b3be9a434579f8b722e138c0e49f9737b33",
          "message": "feat(bb.js): Enable more ZK flavors (#14072)\n\nZK flavors are not included in the generated WASM. This PR adds 'em.\n\n<img width=\"418\" alt=\"image\"\nsrc=\"https://github.com/user-attachments/assets/a8f38ff6-62d0-4124-9115-b96a12414e78\"\n/>\n\nCo-authored-by: ludamad <adam.domurad@gmail.com>",
          "timestamp": "2025-05-05T18:23:14Z",
          "tree_id": "c6ae290ba20e5c3eb0d5e92e8be2149944d83bd4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a1148b3be9a434579f8b722e138c0e49f9737b33"
        },
        "date": 1746473352330,
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
            "value": 91320,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624527,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56032,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263166,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206131,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193523,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211106,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149556,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155866,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151180,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347198,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151685,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 146998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 157995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167643,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162957,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173954,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169268,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107718,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103031,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114028,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109342,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123676,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118990,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100325,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37209,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56276,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
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
            "value": 26866078,
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
          "id": "bb78059a896a4e8332054075e98cff4d00f6920a",
          "message": "fix(bb): solve memory blowup, acir::Opcode 7kb => 386 bytes (#14042)\n\nAdded a script that can be run after acir generations, until\nhttps://github.com/zefchain/serde-reflection/issues/75 has attention\nThe issue is that we have a giant enum over these static arrays. In\nRust, they are `Box<... array ...>`, which would be `std::unique_ptr<...\narray ...>` in C++. We have an issue open to do just this - but\nmeanwhile, the more practical move is to use std::shared_ptr to avoid\nfurther changes.\n\nAlso uses std::move more to reduce time and allocation.",
          "timestamp": "2025-05-05T23:29:12Z",
          "tree_id": "ebd4b6cd572da6e0b7168f962739c9b1ff4cc4ad",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/bb78059a896a4e8332054075e98cff4d00f6920a"
        },
        "date": 1746491491512,
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
            "value": 91320,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624527,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56032,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263166,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206131,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193523,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211106,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149556,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155866,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151180,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347198,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151685,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 146998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 157995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167643,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162957,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173954,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169268,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107718,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103031,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114028,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109342,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123676,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118990,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100325,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37209,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56276,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
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
            "value": 26866078,
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
          "id": "a0d48a5b515813b9d11d85fad0ef15760b4a028a",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"2483a77bd8\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"2483a77bd8\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-05-06T02:31:49Z",
          "tree_id": "60f660004a9cca06fff737684a46dd370ddd381c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a0d48a5b515813b9d11d85fad0ef15760b4a028a"
        },
        "date": 1746500746722,
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
            "value": 91320,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624527,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56032,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263166,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206131,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193523,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211106,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149556,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155866,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151180,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347198,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151685,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 146998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 157995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167643,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162957,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173954,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169268,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107718,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103031,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114028,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109342,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123676,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118990,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100325,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37209,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56276,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
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
            "value": 26866078,
            "unit": "gates"
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
          "id": "739402e7eb1ab6524723c6af98151f8f0745b5b8",
          "message": "fix(docs): Fix token bridge tutorial source code links (#14086)\n\n- the file changed locations\n- adds detail to how docs versioning works",
          "timestamp": "2025-05-06T07:27:54Z",
          "tree_id": "7862db1aaade5a19ed053562addd41aabdd1d0e2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/739402e7eb1ab6524723c6af98151f8f0745b5b8"
        },
        "date": 1746518351314,
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
            "value": 91320,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624527,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56032,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263166,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206131,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193523,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211106,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149556,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155866,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151180,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347198,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151685,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 146998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 157995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167643,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162957,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173954,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169268,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107718,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103031,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114028,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109342,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123676,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118990,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100325,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37209,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56276,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
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
            "value": 26866078,
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
          "distinct": true,
          "id": "30c2030c13c80df5c03f441139dde3387b0931cb",
          "message": "chore: better handling of ultra ops in translator circuit builder (#13990)\n\nThis PR attempts to improve clarity in the circuit builder and reduce\nthe size of existing methods by separating the logic that checks ultra\nops and the logic that populates corresponding wire data using the ultra\nop from other builder logic. This will additionally help code\nshareability in upcoming modifications. I also fixed the\n`TranslatorOpcodeConstraintRelation` as it was accepting some opcodes\nthat are not supported",
          "timestamp": "2025-05-06T13:39:06Z",
          "tree_id": "e42723a846cc88379cccfd442b0bb139ed4108ae",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/30c2030c13c80df5c03f441139dde3387b0931cb"
        },
        "date": 1746542555758,
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
            "value": 91320,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624527,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56032,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263166,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206131,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193523,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211106,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149556,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155866,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151180,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347198,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151685,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 146998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 157995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167643,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162957,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173954,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169268,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107718,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103031,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114028,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109342,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123676,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118990,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100325,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37209,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56276,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
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
            "value": 26866078,
            "unit": "gates"
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
          "id": "187c5fc4620336105d7341403b04ed619157f9a7",
          "message": "fix: goblin recursive bugs (#13124)\n\n* Pass `translation_evaluations` from ECCVM to Translator verifier\nwithout creating unconstrained witnesses\n* Remove `translation_evaluations` from `GoblinProof`.\n* Replace insecure `pow()` in ECCVM verifier with a squaring loop\n\n* Fix a bug in `dyadic_size()` method in `MegaTraceBlockData`.",
          "timestamp": "2025-05-06T15:44:11Z",
          "tree_id": "db5a14571c68d6f35b4caa143ea73878b4710b7a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/187c5fc4620336105d7341403b04ed619157f9a7"
        },
        "date": 1746548700656,
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
            "value": 91320,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624527,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56032,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263166,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206131,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193523,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211106,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149556,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155866,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151180,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347198,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151685,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 146998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 157995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167643,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162957,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173954,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169268,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107718,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103031,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114028,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109342,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123676,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118990,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100325,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37209,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56276,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
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
            "value": 26866078,
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
          "id": "f061a1003c1b36897996ba4e7770a0275e334b81",
          "message": "fix: Set and map keys should be strings (#13993)\n\nThis PR fixes a couple of instances of maps and sets that don't have\nstring keys.",
          "timestamp": "2025-05-06T17:00:05Z",
          "tree_id": "279c80d0ec4d97eb075bfff5c200935384af8e77",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f061a1003c1b36897996ba4e7770a0275e334b81"
        },
        "date": 1746553625729,
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
            "value": 91320,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624527,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56032,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263166,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206131,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193523,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211106,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149556,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155866,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151180,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347198,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151685,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 146998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 157995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167643,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162957,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173954,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169268,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107718,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103031,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114028,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109342,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123676,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118990,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100325,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37209,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56276,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
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
            "value": 26866078,
            "unit": "gates"
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
          "id": "5f2097ce85f8aa4e934808a892442af97ed66735",
          "message": "feat: playground updates (#14103)\n\nSyncing from alpha-testnet\n\n---------\n\nCo-authored-by: thunkar <gregojquiros@gmail.com>\nCo-authored-by: Joe Andrews <joe@fuuzik.com>",
          "timestamp": "2025-05-06T20:03:14Z",
          "tree_id": "bdc29e2910af35e652055ac278df4426e6139dbf",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5f2097ce85f8aa4e934808a892442af97ed66735"
        },
        "date": 1746564588136,
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
            "value": 91320,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624527,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56032,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263166,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206131,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193523,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211106,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149556,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155866,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151180,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347198,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151685,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 146998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 157995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167643,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162957,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173954,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169268,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107718,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103031,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114028,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109342,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123676,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118990,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100325,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37209,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56276,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
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
            "value": 26866078,
            "unit": "gates"
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
          "distinct": false,
          "id": "a5e2dfc50b4d8e2ee452909d6e4c66099f82f2ae",
          "message": "chore(docs): Update public testnet node url (#14120)\n\nUpdates the public node url to\n`https://aztec-alpha-testnet-fullnode.zkv.xyz`",
          "timestamp": "2025-05-06T21:19:21Z",
          "tree_id": "cbacea0b23811bdde9eeecb325439068334f5e35",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a5e2dfc50b4d8e2ee452909d6e4c66099f82f2ae"
        },
        "date": 1746568677584,
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
            "value": 91320,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624527,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56032,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263166,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206131,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193523,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211106,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149556,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155866,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151180,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347198,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151685,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 146998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 157995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167643,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162957,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173954,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169268,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107718,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103031,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114028,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109342,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123676,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118990,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100325,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37209,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56276,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
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
            "value": 26866078,
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
          "id": "a515ae8f76beaa47adb1071606846671b6f1eb22",
          "message": "feat!: Aggregate pairing points (#13972)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1304.\nCloses https://github.com/AztecProtocol/barretenberg/issues/1069.\nCloses https://github.com/AztecProtocol/barretenberg/issues/801.\nCloses https://github.com/AztecProtocol/barretenberg/issues/1309.\nCloses https://github.com/AztecProtocol/barretenberg/issues/950.\nCloses https://github.com/AztecProtocol/barretenberg/issues/1021.\n\n- **Refactor how we aggregate.** Before, we used to pass in the input\npairing point object into functions as an argument, following how plonk\nhad done it. However, this is entirely unnecessary if we just aggregate\nthe output pairing points outside of it. For example, if function A\ncalls a recursive verifier, we will just do the aggregation in function\nA instead of inside the recursive verifier. The ordering of aggregation\ndoes not matter at all - as long as we are using valid recursion\nseparators, we should be fine.\n- **Add [[nodiscard]] attributes and remove [[maybe_unused]]\nattributes** to verify_proof calls to help us check for unused pairing\npoints.\n- **Aggregate properly everywhere.** We used to ignore pairing points in\nmost places, but now we try to aggregate everything properly. I tried to\nbe thorough in my search, but its possible that I missed somewhere.\n\nDue to the refactoring, we also close\nhttps://github.com/AztecProtocol/barretenberg/issues/1380, as we remove\n1 unnecessary aggregate call in almost all situations by avoiding\naggregation with a default object. Because of this, we drop the number\nof Ultra gates of the UltraRecursiveVerifier **from 730689 to 664852, a\ndrop of around 66k or 9%**.\n\n---------\n\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>\nCo-authored-by: ludamad <domuradical@gmail.com>",
          "timestamp": "2025-05-06T22:24:38Z",
          "tree_id": "496a8eb56d8ebf71cbe018981ea0c7db4ecf9114",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a515ae8f76beaa47adb1071606846671b6f1eb22"
        },
        "date": 1746574677725,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
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
          "id": "1ff4447bfbe6833b06243117955deccc01ec2955",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"25bc63e443\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"25bc63e443\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-05-07T02:32:07Z",
          "tree_id": "48a0f2a4a56b72378400e4bbb6bbf338806919df",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1ff4447bfbe6833b06243117955deccc01ec2955"
        },
        "date": 1746587186881,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
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
          "id": "810053233e7bedacc38892dbdc873e46792f42c3",
          "message": "chore: run setupEpoch separately (#13984)\n\nFollowing the seed snapshots pr #13577 there was a change that mean that\n`getCurrentProposer` can end up running the `setupEpoch` (reducing\nnumber of different flows etc). However, that meant that when we were\nrunning our benchmark test to get some gas numbers, we never end up\nincluding the gas spent to setup the epoch. To address, we are now\nexplicitly calling `setupEpoch` such that we get some neat measurements\nfor it, also making it clear when changes are made that impact the\nsampling.\n\nA nice side effect, is that it more simply allow us to do the proper\namortized cost for sampling as the propose is for 360 tx, but sampling\nis for 11520 (32 * 360). This new setup makes it more simple to see the\ndirect impact from the sampling on tx costs etc.",
          "timestamp": "2025-05-07T07:40:09Z",
          "tree_id": "b00e0fa7fc47b729ef2f7a0c6eba4eb86deabdaa",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/810053233e7bedacc38892dbdc873e46792f42c3"
        },
        "date": 1746606078692,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
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
          "id": "47926c91bdbfc6ae0dafb4b7b2c18681fabe3ec9",
          "message": "feat: initial gas bench gh (#13986)\n\nAdding benchmark reporting for some l1 gas numbers (see\nhttps://aztecprotocol.github.io/aztec-packages/dev/l1-gas-bench/).\n\nCurrently have removed the if, to see it being run on this pr and get it\ngoing.",
          "timestamp": "2025-05-07T08:53:19Z",
          "tree_id": "9d76ddf7975d251b43fb7addf206f9c8ec3d6986",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/47926c91bdbfc6ae0dafb4b7b2c18681fabe3ec9"
        },
        "date": 1746609989657,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
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
          "distinct": true,
          "id": "e6e429e631c745770337192947fd37646d985475",
          "message": "chore: start translator logic at an even index (#13985)\n\nWe want to be able to add random data in the ultra op queue (at the\nbeginning and end) to make the merge protocol zk without affecting the\nlogic of translator or the version of the op queue used by eccvm. All\nwires in translator circuit builder start with a 0 to enable shifting.\nBut having the builder add data in all wires, including the ones\ncontaining op queue data, breaks the ability of the Goblin verifier to\ncompare the full table commitments in the last merge against the\ncorresponding translator witness polynomials commitments.\n\nTo solve this we want to add the 0 row (plus random rows eventually) via\nthe ultra op queue logic, but each ultra op populates two positions in\nthe translator wires. Prior to this work, the translator relations were\nimplemented to expect the main logic to start at an odd index (i.e. the\nfirst ultra op resides at index 1 and 2). Preserving this would have\nmeant we need to implement a special branch of logic in the ultra op\nqueue that only populates 1 row with data rather than 2 in the ultra\ntables. This PR swaps what happens at even and odd indexes to facilitate\nadding 0 and random rows via the existing op queue logic by making\ntranslator logic start at an even index (so currently at index 2).",
          "timestamp": "2025-05-07T08:58:25Z",
          "tree_id": "9e8217b3cf90bf9c1ef436700a12a59fda5dfcf5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e6e429e631c745770337192947fd37646d985475"
        },
        "date": 1746611967754,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
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
          "id": "b50e8bab66f4068325871c52924df57db7a7d873",
          "message": "chore: L1 reorg test for loading blocks before L1 syncpoint (#14122)\n\nAdds an L1 reorg scenario test for loading blocks older than last sync\npoint (see `checkForNewBlocksBeforeL1SyncPoint`)",
          "timestamp": "2025-05-07T10:08:16Z",
          "tree_id": "ab577415275e48feda8df2af2dc8d7dd153e31cd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b50e8bab66f4068325871c52924df57db7a7d873"
        },
        "date": 1746614976647,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
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
          "id": "163052f00f99fff838148b5af65ef25e54d6e2ef",
          "message": "fix: aztec with no args complains on mac (#14123)\n\nbash 3.2.57 on mac considers a=() undefined\n\n```\ncopypaste@copypastes-MacBook-Pro aztec-test % aztec\n/Users/copypaste/.aztec/bin/aztec: line 43: args[@]: unbound variable\n```",
          "timestamp": "2025-05-07T11:18:14Z",
          "tree_id": "6d14b0c967a626926da2d97daa9a645b49235451",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/163052f00f99fff838148b5af65ef25e54d6e2ef"
        },
        "date": 1746619135251,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
            "unit": "gates"
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
          "distinct": true,
          "id": "e98bfa4be1b9e84193e60e564b1e13b0aaed4ee8",
          "message": "chore: updated sepolia account funding actions (#13999)\n\n- new action specifically to fund accounts on sepolia, derived from a\nmnemonic + values file with mnemonic indices\n- can be used with an existing mnemonic, or will generate a new one if\nGCP secret doesn't exist\n- network-deploy now uses that action so can also be used with an\nexisting mnemonic or will create a new one with chosen name\n\nFixes #14113",
          "timestamp": "2025-05-07T12:56:12Z",
          "tree_id": "180d5353659a24ef0b1afbe8ebcab3395c0893fd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e98bfa4be1b9e84193e60e564b1e13b0aaed4ee8"
        },
        "date": 1746625215116,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
            "unit": "gates"
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
          "id": "8d81136d3ddf396fc061fa8074c9ba5f9fb2ab40",
          "message": "chore: more specific world state tree map size config (#13905)\n\nCloses https://github.com/AztecProtocol/aztec-packages/issues/13386\n\nAdds tree map size configurations for each specific world state tree\n(archive, nullifier tree, note hash tree, public data tree, L1 to L2\nmessage tree).\n\nAdditionally, adds a blob sink map size configuration.",
          "timestamp": "2025-05-07T12:29:35Z",
          "tree_id": "60f6a8bc2bbb4c005a9b71f2462259e4987b2646",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8d81136d3ddf396fc061fa8074c9ba5f9fb2ab40"
        },
        "date": 1746625384321,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
            "unit": "gates"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "olehmisar@gmail.com",
            "name": "oleh",
            "username": "olehmisar"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "3a901453a5d99969cc29d4d89de5a4decf73f97c",
          "message": "fix: use globalThis instead of self in PXE (#14136)\n\nA simple fix to make `@pxe/client` work in node.js. Not tested. Please\nrun CI. Similar to\nhttps://github.com/AztecProtocol/aztec-packages/pull/10747",
          "timestamp": "2025-05-07T15:30:47Z",
          "tree_id": "b42efec1cb67a5b021cf8304954a0129c1048587",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3a901453a5d99969cc29d4d89de5a4decf73f97c"
        },
        "date": 1746633840249,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
            "unit": "gates"
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
          "id": "72244db5a5d17a66b25ed82b1493845d80f05726",
          "message": "docs: add seq quickstart (#14081)\n\nAdded a quickstart section to the sequencer doc.\n\n---------\n\nCo-authored-by: josh crites <critesjosh@gmail.com>",
          "timestamp": "2025-05-07T15:47:38Z",
          "tree_id": "ebbc77e3c63b0d41df5dfad114deda2afd242204",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/72244db5a5d17a66b25ed82b1493845d80f05726"
        },
        "date": 1746635457354,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
            "unit": "gates"
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
          "distinct": false,
          "id": "2a18007b3d9c5c42496cb441a933528f78b2506e",
          "message": "chore(docs): Make alpha-testnet storage doc match v0.86 (#14134)\n\napplies some feedback to the alpha-testnet docs that is in v0.86.0",
          "timestamp": "2025-05-07T15:58:25Z",
          "tree_id": "07d762c59333657785e03dc07a5368d2f037c0b3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2a18007b3d9c5c42496cb441a933528f78b2506e"
        },
        "date": 1746636722924,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
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
          "distinct": true,
          "id": "647bb120e484e6502efe12773202362c3b81a7e0",
          "message": "chore: allow for multiple aztec-wallet invocations (#14141)\n\nResolves #14140.",
          "timestamp": "2025-05-07T16:31:36Z",
          "tree_id": "5a6311b6af52c2377e6f98fc3c4ac1a1815c04fd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/647bb120e484e6502efe12773202362c3b81a7e0"
        },
        "date": 1746637697536,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
            "unit": "gates"
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
          "id": "98a7ec01df19e1d5981cc21a9487a192497849a1",
          "message": "feat: more profiling (#14142)\n\n- Consolidation of our profiling/timing structs in order to surface more\nand more data to the user on \"where is time spent\" when sending TXs.\n- Display of profiling information on both playground and CLI wallet\n- General improvements for cli-wallet startup time and usability, trying\nto remove the mandatory node or pxe requirements for local-only\ncommands.\n- Removed useless fee estimation default param that forced resimulation\non cli-wallet. Heads up! Fee estimation right now is all but disabled in\nboth playground and cli-wallet, but at least we're not wasting time on\nit. Discussed a bit with @iAmMichaelConnor, and will review soon with\nsane defaults",
          "timestamp": "2025-05-07T18:47:12Z",
          "tree_id": "18869b2a4e7a609e3e0009c292439716fd844e11",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/98a7ec01df19e1d5981cc21a9487a192497849a1"
        },
        "date": 1746645661677,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
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
          "distinct": true,
          "id": "08184fbc13622a15f5bdea4f227dbe9d45685709",
          "message": "chore: civc debugging utils (#13900)\n\nAdds some debugging functionality that's been useful to me on a number\nof occasions including\n1. Two tests in AcirIntegrationTest for debugging CIVC from msgpack\ninputs (disabled like all of the others)\n2. A `compute_vk_hash` utility for debugging discrepancies between\ncircuits that are expected to be equivalent\n3. Adds `Debug CIVC transaction` config to launch.json to allow quick\ndebugging of CIVC w/ msgpack inputs",
          "timestamp": "2025-05-07T20:22:59Z",
          "tree_id": "dc90d3579375f61f24a0b8ca514e9f9ee6fa4611",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/08184fbc13622a15f5bdea4f227dbe9d45685709"
        },
        "date": 1746651855801,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
            "unit": "gates"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "rodrigo.ferreira@aya.yale.edu",
            "name": "Rodrigo Ferreira",
            "username": "raugfer"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "6d593a64afc8b2e6524292c716c0226e3334b44e",
          "message": "fix(starknet-bb): Clears extraneous MSB from r_inv_wasm_5/r_inv_wasm_7 (#13704)\n\nThis PR attempts to fix a bb.js/WASM bug for the UltraStarknetFlavor.\nUnfortunately, it was introduced by the original implementation\n(#11489).\n\nIn short, the STARK252 field constants `r_inv_wasm_5` and `r_inv_wasm_7`\nwere declared with 30-bits when 29-bits are expected.\n\nHopefully this simple change should fix bb.js's buggy behavior.\n\n@ludamad Please take a look, thanks in advance",
          "timestamp": "2025-05-07T22:21:07+01:00",
          "tree_id": "605d3d8c34f0a4f589262cacf2967601690c7094",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6d593a64afc8b2e6524292c716c0226e3334b44e"
        },
        "date": 1746655914611,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
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
          "id": "03d6547218cee1eb175f287f81136c6adb149a79",
          "message": "feat(release): intel mac version fix, starknet bb variant build (#14013)\n\nSo far just enabled for mac. Linux and WASM support TODO\n\nNoticed that intel mac had the wrong sed command while at it",
          "timestamp": "2025-05-07T21:51:05Z",
          "tree_id": "b9808b177b76dad3d833859d1cba99f47d30a652",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/03d6547218cee1eb175f287f81136c6adb149a79"
        },
        "date": 1746658388584,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
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
          "id": "7d5bb11ce79ee8094e5f0b2fa489259c6f4d2514",
          "message": "fix: yp run_test.sh arg passing (#14154)",
          "timestamp": "2025-05-07T23:26:02Z",
          "tree_id": "a1bf033efbdf28f51351adea4c65d46632766c0f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7d5bb11ce79ee8094e5f0b2fa489259c6f4d2514"
        },
        "date": 1746662308112,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
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
          "id": "c855d048fe250d55b220e6d26822ee16d62e228c",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"aa67df1d68\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"aa67df1d68\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-05-08T02:32:23Z",
          "tree_id": "90a82df450aebcde1460c599793b795865971bec",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c855d048fe250d55b220e6d26822ee16d62e228c"
        },
        "date": 1746673631188,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
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
          "id": "4fab079c0dcf45117ca6dcd1b46bcb01b50f1bd2",
          "message": "chore: advance block when deploying contract txe (#14107)\n\nRight now we mine an extra block when we do not need to and not after\nany initializers have been emitted, forcing us to\n`env.advance_block_by()` after any time we deploy to actually discover\nthose side effects via note discovery.\n\nNote that this removes the ability to check the note cache directly\nafter deployment but I think that is such a niche case and we can always\nre-add an endpoint that doesn't advance block after deployment if\nnecessary",
          "timestamp": "2025-05-08T05:49:02Z",
          "tree_id": "07bb24ec2c7b1aa58e1a22b1962fdb4906cb340c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4fab079c0dcf45117ca6dcd1b46bcb01b50f1bd2"
        },
        "date": 1746685981919,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
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
          "distinct": true,
          "id": "957aaaef0fa3b93cf6d24c429d06563cabb46856",
          "message": "feat: txe new contract calling flow (#14020)\n\nThis is the first phase of TXe 2.0.\n\nWe're adding a new interface for calling private contract functions.\nThis handles external calls, as well as proper public calls.\n\nThis leverages the existing `PrivateExecutionContext` as well as the\n`PublicProcessor` to handle the execution.",
          "timestamp": "2025-05-08T10:06:40Z",
          "tree_id": "457c15d2872416151bb1d0181109278c40a86a5c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/957aaaef0fa3b93cf6d24c429d06563cabb46856"
        },
        "date": 1746701461529,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
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
          "distinct": true,
          "id": "5c14e5f41dabad01c79e337c23dc85bda209dc82",
          "message": "chore: creating a node rpc should have retries by default (#14159)\n\nExternals are seeing lots of issues with 502's which break the\nuseability of anything that requires a node via rpc (which is nearly\neverything). The actual backoff is arbitrarily set, but this is a\nplaceholder series that hopefully informs our builders that a retry is\npossible. Furthermore I foresee this simple retry solving and unblocking\na large proportion of the current issues faced.",
          "timestamp": "2025-05-08T12:46:05Z",
          "tree_id": "9a90a6561b6fab3d213a09341323087c109fbf15",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5c14e5f41dabad01c79e337c23dc85bda209dc82"
        },
        "date": 1746710326007,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
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
          "id": "d5e6b09350a86237e422d713d1831a837e8ce46e",
          "message": "chore: Merging alpha testnet changes back to master (#14143)\n\nThis PR cherry picks changes from alpha-testnet back to master.\n\n---------\n\nCo-authored-by: Alex Gherghisan <alexghr@users.noreply.github.com>\nCo-authored-by: Maddiaa <47148561+Maddiaa0@users.noreply.github.com>\nCo-authored-by: saleel <saleel@aztecprotocol.com>\nCo-authored-by: spypsy <spypsy@users.noreply.github.com>\nCo-authored-by: Gregorio Juliana <gregojquiros@gmail.com>\nCo-authored-by: saleel <saleel@saleel.xyz>\nCo-authored-by: Santiago Palladino <santiago@aztecprotocol.com>\nCo-authored-by: Santiago Palladino <santiago@aztec-labs.com>",
          "timestamp": "2025-05-08T13:29:28Z",
          "tree_id": "290103d8a5b0b944440d3e7fb55b755f1f0babb8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d5e6b09350a86237e422d713d1831a837e8ce46e"
        },
        "date": 1746713346468,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
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
          "id": "6b23d48eddee95af347487073f2d69a99ad241d6",
          "message": "refactor: timestamp based snapshots (#14128)\n\nFixes #13877. \n\nUpdates the address snapshot library to be based on time only, and rely\non the caller to pass meaningful time in. The staking lib can then feed\nalong the timestamp for which the current epoch is stable `timeOfEpoch -\n1` and we can neatly use the same storage later for different rollups.\n\nAlters quite a lot of the tests to test the timings.",
          "timestamp": "2025-05-08T13:47:32Z",
          "tree_id": "8728d8c1d12ccb57afe3c46348c3bb70559671df",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6b23d48eddee95af347487073f2d69a99ad241d6"
        },
        "date": 1746714538694,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
            "unit": "gates"
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
          "distinct": true,
          "id": "33153b7d07c99aee9ed7e54e2ecd3659fc181dbf",
          "message": "fix: values file ordering in deployment terraform (#14166)",
          "timestamp": "2025-05-08T14:56:56Z",
          "tree_id": "015f2fdecb514522c813c5228230da017edd60bd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/33153b7d07c99aee9ed7e54e2ecd3659fc181dbf"
        },
        "date": 1746718490348,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
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
          "id": "f85d01c16ebe9fbf384f74ad72cb6b5c86b5174e",
          "message": "feat: minimal Avm PublicInputs in Cpp, Noir & Cpp `to/from_columns`, PI tracegen and evaluate all PI cols in verifiers (#13698)\n\nAlso row-indices constants are defined/computed.\n\n*NOTE:* The 'lengths' entries flagged as \"NEW\" are not added in this PR.\n\n\n![image](https://github.com/user-attachments/assets/cc10c638-817f-4741-878e-13238c6a22dd)\n\n![image](https://github.com/user-attachments/assets/8bc36e9d-d7ca-42ea-949a-a2a05925cdb0)\n\n---------\n\nCo-authored-by: dbanks12 <david@aztecprotocol.com>",
          "timestamp": "2025-05-08T18:32:59Z",
          "tree_id": "404ef7d3620d814436e990cdb4df421f268511c4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f85d01c16ebe9fbf384f74ad72cb6b5c86b5174e"
        },
        "date": 1746731288029,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
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
          "distinct": false,
          "id": "360fa17cacf5411d98a617f006332a4379d4e543",
          "message": "fix: denoise works without redis creds (#14169)\n\nUnblocks externals",
          "timestamp": "2025-05-08T17:43:12Z",
          "tree_id": "f99299cfbcd26fae07917d0dd333a0b12833ddda",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/360fa17cacf5411d98a617f006332a4379d4e543"
        },
        "date": 1746731443714,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
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
          "id": "5ccf2ad2cdc3595afd4a167a7f9b565b8ecdca20",
          "message": "fix: l2 to l1 messages from private should be properly ordered by phase alongside publicly created ones (#14118)\n\nAlso, better tests of side effects for the public tx simulator,\nespecially including tests of notes & messages being thrown away/kept\nproperly based on whether a phase reverted.\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-08T19:33:45Z",
          "tree_id": "617f6cd5383c1c968358caf088e3735f3641a059",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5ccf2ad2cdc3595afd4a167a7f9b565b8ecdca20"
        },
        "date": 1746735247288,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
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
          "distinct": false,
          "id": "fc3910288b3c43ae3c2939d88acc1cd5485f0330",
          "message": "feat: full AVM public inputs struct in C++, including tracegen of full PI columns (#14088)\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-08T20:20:24Z",
          "tree_id": "796b748f9be43a666cc9ffba1c2ccebcc5cb663f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fc3910288b3c43ae3c2939d88acc1cd5485f0330"
        },
        "date": 1746739922495,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
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
          "distinct": false,
          "id": "278661f67ce4d444b068b331971a5bb3e2a2461f",
          "message": "feat!: AVM DebugLog opcode should be (mostly) a no-op unless doing verbose \"client-initiated-simulation\" (#14085)\n\nUnless initiated from `node.simulatePublicCalls()` or from TXE, with\nlog-level verbose, DebugLog should be a no-op.\n\nIt is a no-op, but it resolves memory address operands to avoid the need\nto special case things in C++. Special casing would be \"this instruction\nhas memory offset operands but we only _sometimes_ want to resolve and\ntag check them and generate events\".\n\nIt does not do any slice memory stuff when in no-op mode.\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-08T21:11:35Z",
          "tree_id": "5fbed74cb1b033fb7032c584f49136af2022a76d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/278661f67ce4d444b068b331971a5bb3e2a2461f"
        },
        "date": 1746743041399,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
            "unit": "gates"
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
          "id": "3a5f9cfd12d602d35888cb8cd0d247983d3e9c9a",
          "message": "fix: tuple mismatch in some tests (#14175)\n\nIf you have code like this:\n\n```noir\nfn main() {\n    let (x, y) = (1, 2, 3);\n}\n```\n\nthen Noir, unlike Rust, doesn't complain that the left-hand side tuple\ndoesn't have exactly the number of elements that are on the right side.\n\nThat's about to change (it's a bug) when this PR merges:\nhttps://github.com/noir-lang/noir/pull/8424\n\nBefore that, we can fix the existing errors here.\n\nI chose to ignore the extra tuple element because it's currently\nignored, but I don't know if the \"owner\" should be used for something in\ntests (alternatively maybe \"owner\" should not be returned if it's not\ngoing to be used).",
          "timestamp": "2025-05-08T22:03:21Z",
          "tree_id": "e62f62cfb88f56e4b3c15e6e138b8c157418c867",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3a5f9cfd12d602d35888cb8cd0d247983d3e9c9a"
        },
        "date": 1746744495140,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
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
          "id": "5b2ead29cd6e82013019a6d288cadae6123a1700",
          "message": "refactor: flat grumpkin CRS, use CDN, remove old srs_db  (#14097)\n\nA bunch of bn254/grumpkin CRS cleanup. The main motivation was to get\nrid of the extra srs_db download in CI, but it was tangled enough that\nit was best the code was refactored first.\n\nMain changes:\n- Rework the old file crs factory class to be a 'NativeCrsFactory',\nreflecting its use in native code (WASM still uses MemCrsFactory). This\nacts like a file-backed CRS that reads from ~/.bb-crs if allow_download\n= false, otherwise it reads from the network if not enough CRS points\nare found. Tested in crs_factory.test.cpp.\n- Remove the srs_db folder that redundantly downloads CRS. Rework all\nreferences to it to instead use the downloaded-on-demand version in\n~/.bb-crs\n- 'Flatten' grumpkin i.e. removing the header. This is for now called\ngrumpkin_g1.flat.dat but we can shortly move it to the original\ngrumpkin_g1.dat name. Remove the hacky grumpkin_size file as it is now\neasy to tell from the .dat file size itself.\n- Move to the new CDN-delivered CRS URL\n\nOther changes:\n- Remove the hacky up-front CRS initialization (except in WASM/bb.js,\nwhere it is still needed), fully embracing the originally intended\non-demand CRS loading.\n- no redundant verifier and prover CRS's, just make one CRS that does\nboth. We basically always want the verifier CRS around, and it's easy\nenough to represent a verifier as a 'prover' CRS with one point for\nbn254. For grumpkin, they were already identical.\n- Allow for short syntax `bb prove -s client_ivc` if\n`ivc-inputs.msgpack` is in the current working directory. The proof will\ngo in an 'out' folder that is created if it does not exist.\n- Refactor old tests that used very low level ways of reading CRS. This\nuncovered fundamental flaws in them, such as trying to read `2**20`\npoints from grumpkin (which has `2**18` max)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1163\nCloses https://github.com/AztecProtocol/barretenberg/issues/1180\n\n---------\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-08T22:41:16Z",
          "tree_id": "0a5d30ae1ade27d9bed2dd10a5a65cb35cddd2c8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5b2ead29cd6e82013019a6d288cadae6123a1700"
        },
        "date": 1746747988450,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
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
          "distinct": true,
          "id": "17f5c41757abf15364ba7f937200508d3e8993fc",
          "message": "feat!: add pairing agg in a few more places (#14125)\n\n1. Add nested pairing point aggregation to the native UH verifier (uses\nnew native `PairingPoints` class)\n2. Add aggregation of nested pairing points of final accumulated circuit\nin hiding circuit\n3. Add precomputed VKs to ivc-inputs.msgpack in ivc_integration suite\n4. fix bug in `generate3FunctionTestingIVCStack` (was passing the wrong\nVK for one circuit)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1382",
          "timestamp": "2025-05-09T00:20:02Z",
          "tree_id": "b6712cf87466854026528cea5faec6f4a5a0d1d0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/17f5c41757abf15364ba7f937200508d3e8993fc"
        },
        "date": 1746753701098,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
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
          "id": "a6de3d0385c1dd1b1dd6c5f0b98430ab8ff85ad5",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"73cf91d049\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"73cf91d049\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-05-09T02:32:03Z",
          "tree_id": "435df0f792bfb9a0422f5adb9ac3b23e704e5363",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a6de3d0385c1dd1b1dd6c5f0b98430ab8ff85ad5"
        },
        "date": 1746759939365,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
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
          "id": "b1b12774afcc5d395a97c379612019d03df642ec",
          "message": "chore: allow devnet / network tests to be run from local (#14158)\n\nThis makes it easier for someone to run the devnet tests from local\nusing flag `LOCAL=true`",
          "timestamp": "2025-05-09T10:25:56Z",
          "tree_id": "4045fbf3074c2e9b1113d3c754ed2068dd2cd3dd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b1b12774afcc5d395a97c379612019d03df642ec"
        },
        "date": 1746789594147,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
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
          "id": "cf08c09b975a0d0ce69eba8418b1743e6e0e61e3",
          "message": "feat: add txe test contract + a new helper that disables out of context oracles (#14165)\n\nThis PR simply moves some tests from in `CounterContract` #14020 to a\nnew bespoke `TXETest` contract. Also it puts the scaffolding in for\ndisabling oracles in a txe test not invoked from a `env.` function",
          "timestamp": "2025-05-09T11:07:07Z",
          "tree_id": "545659fe9ebb8b98d32f648c38a5b9b92a7acea3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cf08c09b975a0d0ce69eba8418b1743e6e0e61e3"
        },
        "date": 1746790637922,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
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
          "id": "cf7ddb6633d1b6f186272bbf8fc20d5bd8a3b4b5",
          "message": "feat(spartan): globally deployable aztec node helm chart (#13850)\n\n## Overview\n\nA helm chart that can be used by both us to deploy extra nodes into our\ncluster, without the hassle of editing the full network\nchart, and for outside tooling to use.\n\nLonger term:\n- prover: true will make this a prover node etc.\n\n---------\n\nCo-authored-by: Alex Gherghisan <alexghr@users.noreply.github.com>",
          "timestamp": "2025-05-09T11:20:54Z",
          "tree_id": "c00ec0a95daa9b1d634a534dffe2c4df5eca706e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cf7ddb6633d1b6f186272bbf8fc20d5bd8a3b4b5"
        },
        "date": 1746791389956,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
            "unit": "gates"
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
          "distinct": true,
          "id": "369f60c69d94f2a689c387ab2c6fcf3b5fb64c20",
          "message": "fix: aztec start --help when running another container (#13802)\n\ncurrently if we're running an `aztec start` container, you can't run\n`aztec start --help` if no port settings have been saved, since it'll\ntry to forward the default ports again.\n\nThis creates a special case for `--help` where it doesn't forward any\nports\n\nNot loving this solution, pls offer any alternative suggestions",
          "timestamp": "2025-05-09T11:26:26Z",
          "tree_id": "6a5d5a6021613dce28758d0068aa80b692990d74",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/369f60c69d94f2a689c387ab2c6fcf3b5fb64c20"
        },
        "date": 1746791782325,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
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
          "id": "4fe7c5139d3ad173dababa0b51c95405b44975b1",
          "message": "chore: Reenable sentinel e2e test (#14185)\n\nCI was failing as nodes sometimes started a bit late, causing the\nsentinel to miss the first slot and return a history shorter than\nexpected.\n\nThis PR waits until sentinel has collected the expected data.",
          "timestamp": "2025-05-09T13:54:27Z",
          "tree_id": "1eda318918e99c8cc48db44e5f95579fca536f34",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4fe7c5139d3ad173dababa0b51c95405b44975b1"
        },
        "date": 1746800656533,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2875792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41316,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91840,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624535,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56040,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101306,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274744,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263174,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193531,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188844,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199841,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195155,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209489,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204803,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215800,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211114,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149564,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144877,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155874,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151188,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347206,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 147006,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 158003,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153317,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162965,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173962,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169276,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107726,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103039,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114036,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109350,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123684,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100333,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41832,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37217,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56284,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1902193,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1365201,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1543781,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4690763,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 708555,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3894191,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1463977,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26799938,
            "unit": "gates"
          }
        ]
      }
    ]
  }
}