window.BENCHMARK_DATA = {
  "lastUpdate": 1747058883034,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "C++ Benchmark": [
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
        "date": 1746625389114,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24309,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1869,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77802,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2351,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20892,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2286,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 68741,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3086,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14711,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1194,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48443,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1751,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18113,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1379,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58377,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1917,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12310,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1139,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 40960,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1740,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21813,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1722,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 72479,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2270,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14289,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1190,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48074,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1840,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13578,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1174,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44774,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1823,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746633851555,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24469,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1893,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77077,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2424,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21170,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2289,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 66620,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3004,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14516,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1192,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48878,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1801,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17908,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1375,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59160,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1950,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12253,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1134,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41903,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1772,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21835,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1725,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 70955,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2247,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14268,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1189,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47975,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1806,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13453,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1175,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45205,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1837,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746645671968,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24559,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1899,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77492,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2399,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20817,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2283,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 66892,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3140,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14825,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1189,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49492,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1742,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17897,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1382,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58619,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1960,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12582,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1137,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41198,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1776,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21617,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1724,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71381,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2241,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14250,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1189,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48696,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1854,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13299,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1172,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45142,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1815,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746651844860,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18023.53832300014,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14244.403688 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4809272423,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 202849014,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25436.778253000284,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19896.633414 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 69598.95734,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 69598958000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4239.693132999946,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3690.684573 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11424.795920999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11424798000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2269.19",
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
          "id": "08184fbc13622a15f5bdea4f227dbe9d45685709",
          "message": "chore: civc debugging utils (#13900)\n\nAdds some debugging functionality that's been useful to me on a number\nof occasions including\n1. Two tests in AcirIntegrationTest for debugging CIVC from msgpack\ninputs (disabled like all of the others)\n2. A `compute_vk_hash` utility for debugging discrepancies between\ncircuits that are expected to be equivalent\n3. Adds `Debug CIVC transaction` config to launch.json to allow quick\ndebugging of CIVC w/ msgpack inputs",
          "timestamp": "2025-05-07T20:22:59Z",
          "tree_id": "dc90d3579375f61f24a0b8ca514e9f9ee6fa4611",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/08184fbc13622a15f5bdea4f227dbe9d45685709"
        },
        "date": 1746651859125,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24538,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1886,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78465,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2393,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21258,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2290,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 68403,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3096,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14614,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1197,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48353,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1832,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17926,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1381,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58784,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1993,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12559,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1137,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42372,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1798,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 22181,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1725,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 72120,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2207,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14365,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1210,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47715,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1805,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13367,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1174,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44896,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1829,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746655904191,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17941.482023999924,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14153.833629 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4721756257,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 197644104,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25492.38255199998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19830.045751 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 69243.801628,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 69243802000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4189.918863000457,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3585.073039 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11401.065226,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11401068000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2285.19",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
        "date": 1746655917250,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24324,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1883,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78785,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2358,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20913,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2285,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67606,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3090,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14558,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1194,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48568,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1850,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18044,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1379,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58515,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1975,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12534,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1137,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41980,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1679,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21755,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1759,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71038,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2259,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14321,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1211,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48498,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1819,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13446,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1174,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45818,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1848,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746658378333,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18053.29738899991,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14248.06927 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4783853174,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 197077872,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25343.851401999927,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 20235.673985 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 69672.149165,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 69672150000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4286.154785000235,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3672.132 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11376.459062999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11376460000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2285.19",
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
          "distinct": true,
          "id": "03d6547218cee1eb175f287f81136c6adb149a79",
          "message": "feat(release): intel mac version fix, starknet bb variant build (#14013)\n\nSo far just enabled for mac. Linux and WASM support TODO\n\nNoticed that intel mac had the wrong sed command while at it",
          "timestamp": "2025-05-07T21:51:05Z",
          "tree_id": "b9808b177b76dad3d833859d1cba99f47d30a652",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/03d6547218cee1eb175f287f81136c6adb149a79"
        },
        "date": 1746658390986,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24312,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1869,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77263,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2329,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21026,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2284,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67131,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3160,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 15050,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1192,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48902,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1766,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18055,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1381,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59735,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2002,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12422,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1137,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 40595,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1797,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21810,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1734,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71149,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2295,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14535,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1191,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48376,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1839,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13567,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1173,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45555,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1819,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746662319749,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24462,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1893,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78738,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2317,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20776,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2289,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67838,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3040,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 15030,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1194,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49065,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1829,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18245,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1377,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58713,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1967,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12604,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1135,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42322,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1712,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21601,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1725,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71417,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2289,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14542,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1187,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47860,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1791,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13696,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1171,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45152,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1840,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746673645172,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24145,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1893,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77259,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2385,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21018,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2318,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67291,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3020,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14786,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1198,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49847,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1850,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17935,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1374,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59004,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1954,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12398,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1137,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41404,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1716,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21699,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1725,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 70964,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2289,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14535,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1188,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48370,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1743,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13531,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1174,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45003,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1789,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746685995118,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24586,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1876,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 79089,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2349,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21019,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2288,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67368,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3089,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14578,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1196,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48660,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1850,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17959,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1374,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58329,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1941,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12544,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1132,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42590,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1704,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21803,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1725,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71299,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2261,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14082,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1190,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48046,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1793,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13523,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1174,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45526,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1784,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746701471499,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24367,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1907,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78191,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2321,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20957,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2286,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 68342,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3097,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14764,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1192,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49013,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1833,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17916,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1414,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58397,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1969,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12391,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1137,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41711,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1797,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21881,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1723,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71994,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2195,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14387,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1189,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47768,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1804,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13410,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1175,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44529,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1777,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746710336354,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24094,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1906,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77630,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2303,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20973,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2285,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67344,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3089,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14649,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1195,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48547,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1836,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18077,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1378,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59163,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1911,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12335,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1138,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41560,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1773,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21622,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1760,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71553,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2245,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14275,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1192,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48055,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1849,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13477,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1175,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45014,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1844,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746713357093,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24352,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1872,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78477,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2373,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20878,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2325,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67295,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3096,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14808,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1195,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48666,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1861,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18011,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1381,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 57945,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1951,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12497,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1137,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41692,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1775,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21918,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1758,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71915,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2299,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14296,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1206,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47675,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1822,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13477,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1176,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44240,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1818,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746714548910,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24253,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1867,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77595,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2394,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21078,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2287,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 68244,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3079,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14689,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1193,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48842,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1858,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18101,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1379,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58995,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2004,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12524,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1140,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 40584,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1711,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21895,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1760,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 72554,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2254,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14198,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1191,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47649,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1743,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13574,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1175,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45196,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1807,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746731277554,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17856.30711399972,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14411.841137 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4871980304,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 199952277,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25639.278000000104,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 20125.692335 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 69541.261464,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 69541262000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4256.686510000236,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3520.658771 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11486.423416,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11486427000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2269.19",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
        "date": 1746731290560,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24348,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1896,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77917,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2367,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20959,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2287,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67251,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3120,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14681,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1197,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49515,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1887,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18118,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1414,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58962,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1975,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12532,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1139,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 40890,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1770,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21857,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1737,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 70994,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2280,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14424,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1194,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47884,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1792,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13617,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1174,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45046,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1842,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746735258720,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24476,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1898,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77515,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2402,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21290,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2289,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67497,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2984,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14679,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1192,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49744,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1855,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18030,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1382,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58454,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1957,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12368,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1136,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42327,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1832,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21863,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1725,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71003,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2251,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14180,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1186,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48872,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1835,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13403,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1173,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44711,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1762,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746739911149,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17962.42856700019,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14429.312539 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4796162072,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 196415971,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25421.021898000163,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19870.997017 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 69190.99574700001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 69190996000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4238.27002400003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3573.299211 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11335.711150999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11335713000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2269.19",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
        "date": 1746739925097,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24342,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1910,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77966,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2343,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20892,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2352,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67277,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3096,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14654,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1195,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48934,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1800,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18035,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1381,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59317,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1981,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12421,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1138,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41768,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1789,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21786,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1725,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71346,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2284,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14162,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1189,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48439,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1758,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13654,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1176,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45307,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1785,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746743031337,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18118.888899000012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14250.299770000001 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4795770784,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 196898465,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25233.52181700011,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19980.737789 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 69574.55052599999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 69574551000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4289.637433999815,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3638.9764410000002 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11439.273476999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11439275000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2285.19",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
        "date": 1746743043646,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24396,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1872,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78654,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2386,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20985,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2286,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67342,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3125,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14786,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1193,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 47535,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1871,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18060,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1378,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58014,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1917,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12546,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1136,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42072,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1799,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21697,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1724,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71934,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2243,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14281,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1189,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47139,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1865,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13543,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1175,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44228,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1847,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746744505256,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24353,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1875,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78384,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2342,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21210,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2317,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67473,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3171,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14569,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1194,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49186,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1839,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18015,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1376,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58518,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2007,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12453,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1134,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41320,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1737,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21767,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1760,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71843,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2169,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14334,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1189,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48002,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1816,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13619,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1173,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44926,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1825,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746747976896,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18018.11098600001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14411.926288 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4791873579,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 202958939,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25678.747052999825,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 20113.046798000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 69731.82248799999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 69731824000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4336.500346000321,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3695.7263909999997 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11609.475924,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11609478000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2205.19",
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
          "distinct": true,
          "id": "5b2ead29cd6e82013019a6d288cadae6123a1700",
          "message": "refactor: flat grumpkin CRS, use CDN, remove old srs_db  (#14097)\n\nA bunch of bn254/grumpkin CRS cleanup. The main motivation was to get\nrid of the extra srs_db download in CI, but it was tangled enough that\nit was best the code was refactored first.\n\nMain changes:\n- Rework the old file crs factory class to be a 'NativeCrsFactory',\nreflecting its use in native code (WASM still uses MemCrsFactory). This\nacts like a file-backed CRS that reads from ~/.bb-crs if allow_download\n= false, otherwise it reads from the network if not enough CRS points\nare found. Tested in crs_factory.test.cpp.\n- Remove the srs_db folder that redundantly downloads CRS. Rework all\nreferences to it to instead use the downloaded-on-demand version in\n~/.bb-crs\n- 'Flatten' grumpkin i.e. removing the header. This is for now called\ngrumpkin_g1.flat.dat but we can shortly move it to the original\ngrumpkin_g1.dat name. Remove the hacky grumpkin_size file as it is now\neasy to tell from the .dat file size itself.\n- Move to the new CDN-delivered CRS URL\n\nOther changes:\n- Remove the hacky up-front CRS initialization (except in WASM/bb.js,\nwhere it is still needed), fully embracing the originally intended\non-demand CRS loading.\n- no redundant verifier and prover CRS's, just make one CRS that does\nboth. We basically always want the verifier CRS around, and it's easy\nenough to represent a verifier as a 'prover' CRS with one point for\nbn254. For grumpkin, they were already identical.\n- Allow for short syntax `bb prove -s client_ivc` if\n`ivc-inputs.msgpack` is in the current working directory. The proof will\ngo in an 'out' folder that is created if it does not exist.\n- Refactor old tests that used very low level ways of reading CRS. This\nuncovered fundamental flaws in them, such as trying to read `2**20`\npoints from grumpkin (which has `2**18` max)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1163\nCloses https://github.com/AztecProtocol/barretenberg/issues/1180\n\n---------\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-08T22:41:16Z",
          "tree_id": "0a5d30ae1ade27d9bed2dd10a5a65cb35cddd2c8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5b2ead29cd6e82013019a6d288cadae6123a1700"
        },
        "date": 1746747991403,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24184,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1764,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77886,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2273,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20954,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2300,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 68153,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3153,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14670,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1082,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48643,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1707,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17903,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1268,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 57956,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1764,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12536,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1024,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41200,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1618,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21663,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1613,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71587,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2143,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14045,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1077,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47869,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1634,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13264,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1063,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44593,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1808,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746753690786,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18031.555129000026,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14547.419696 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4853933608,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 206113864,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25586.123500000213,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 20173.618718 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 69406.018694,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 69406019000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4344.59169100046,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3619.2791770000003 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11602.628153,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11602630000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2325.19",
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
          "id": "17f5c41757abf15364ba7f937200508d3e8993fc",
          "message": "feat!: add pairing agg in a few more places (#14125)\n\n1. Add nested pairing point aggregation to the native UH verifier (uses\nnew native `PairingPoints` class)\n2. Add aggregation of nested pairing points of final accumulated circuit\nin hiding circuit\n3. Add precomputed VKs to ivc-inputs.msgpack in ivc_integration suite\n4. fix bug in `generate3FunctionTestingIVCStack` (was passing the wrong\nVK for one circuit)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1382",
          "timestamp": "2025-05-09T00:20:02Z",
          "tree_id": "b6712cf87466854026528cea5faec6f4a5a0d1d0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/17f5c41757abf15364ba7f937200508d3e8993fc"
        },
        "date": 1746753703610,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24050,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1760,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 76823,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2264,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20995,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2333,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67485,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3041,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14861,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1081,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49242,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1743,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17675,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1267,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58608,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1878,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12341,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1024,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 40586,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1577,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21554,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1612,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 70775,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2115,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14260,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1095,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48479,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1633,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13364,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1061,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44259,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1662,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746759952545,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24194,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1761,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78320,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2181,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20792,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2310,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67674,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3111,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14611,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1080,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48318,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1735,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17722,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1267,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58064,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1878,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12245,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1003,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41586,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1640,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21692,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1635,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71105,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2138,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14168,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1078,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47575,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1713,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13219,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1062,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44262,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1705,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746790649262,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24109,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1792,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77261,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2192,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21044,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2310,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67486,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3071,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14638,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1083,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48860,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1627,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17884,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1266,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58493,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1844,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12232,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1026,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41226,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1655,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21724,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1615,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71012,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2118,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14367,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1076,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48514,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1707,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13318,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1062,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44808,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1701,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746800666988,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24200,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1756,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78227,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2263,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21243,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2300,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 68464,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3141,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14400,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1085,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48273,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1709,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17776,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1302,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58134,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1812,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12409,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1027,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41541,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1636,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21931,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1647,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71712,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2069,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 13875,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1074,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47755,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1638,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13141,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1061,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44730,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1756,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "id": "073bc7d4bb65324458febb9ccaf7a92449194542",
          "message": "fix: Handle \"zero\" as key on LMDBv2 map (#14183)\n\nFixes #14182",
          "timestamp": "2025-05-09T14:02:59Z",
          "tree_id": "4f3c518d97a1ae4650a236e2c05456ce79f4173d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/073bc7d4bb65324458febb9ccaf7a92449194542"
        },
        "date": 1746801767257,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24259,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1772,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77891,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2217,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21314,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2309,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 69364,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3099,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14523,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1116,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48385,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1687,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17809,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1303,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 57845,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1785,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12475,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1025,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41256,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1655,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21871,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1610,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 72541,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2201,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14125,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1078,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48001,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1630,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13207,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1063,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 43868,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1742,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "id": "2815d939e11fed9cc6205107171caf6c1a518058",
          "message": "chore(avm): less verbose equality check (#14188)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-05-09T14:25:29Z",
          "tree_id": "05be49142f3ef8292786f954aad4f5ccf3a67122",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2815d939e11fed9cc6205107171caf6c1a518058"
        },
        "date": 1746803072423,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24386,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1764,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78401,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2197,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21256,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2348,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67534,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3104,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14511,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1086,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48190,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1768,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17698,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1265,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58259,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1903,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12338,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1027,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42326,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1619,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21684,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1651,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 70997,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2119,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14007,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1075,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47426,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1681,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13178,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1061,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44821,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1710,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "id": "11cf4e6e4e8804166f45160cdeaf831bab15c018",
          "message": "fix: getEpochAndSlotAtSlot computation (#14189)",
          "timestamp": "2025-05-09T14:52:02Z",
          "tree_id": "3aba754c1c8883062f00d6ab50724229eadf0177",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/11cf4e6e4e8804166f45160cdeaf831bab15c018"
        },
        "date": 1746804996795,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24198,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1779,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77488,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2257,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21077,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2285,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 68693,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3018,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14625,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1081,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 47880,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1695,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18165,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1265,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 57623,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1828,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12250,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1024,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 40964,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1681,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21755,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1644,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 72511,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2071,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14130,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1079,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47095,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1729,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13311,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1062,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44115,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1777,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "id": "cbe7246e9c3e933d3e85076a22d42741f8117b6d",
          "message": "chore: Run all nested e2e tests by default on CI (#14186)\n\nWe were missing all `e2e_epochs` and `e2e_sequencer` tests.",
          "timestamp": "2025-05-09T15:55:22Z",
          "tree_id": "f4f6eea4217f2d1f448b565bcc6df1d88767b005",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cbe7246e9c3e933d3e85076a22d42741f8117b6d"
        },
        "date": 1746811409116,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24393,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1777,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78524,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2241,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20799,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2332,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67414,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3077,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14430,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1082,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49113,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1736,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17752,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1302,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58231,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1903,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12310,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1023,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42317,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1590,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21593,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1613,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 70800,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2135,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 13957,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1077,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48223,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1704,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13327,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1059,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44845,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1712,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "id": "5ff375219c58809a119a42cf96ec1b3ef43904f1",
          "message": "feat!: Indirect flag is now sorted by operand (#14184)\n\nPreviously, the indirect flag was LSB [operand_0_indirect,\noperand_1_indirect, operand_0_relative, operand_1_relative, ...0] MSB.\nThis made it so different amounts of operands would make the indirect\nflag have different meanings. This PR changes it to LSB\n[operand_0_indirect, operand_0_relative, operand_1_indirect ...] MSB\nThis way the meaning of the operand flag doesn't change with the number\nof operands, and we also avoid having to construct addressing with the\nconcrete operand count.",
          "timestamp": "2025-05-09T16:47:30Z",
          "tree_id": "517c992849ee2676af7c74fe1aa1f670f225b8a0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5ff375219c58809a119a42cf96ec1b3ef43904f1"
        },
        "date": 1746812619831,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17933.83108399985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14220.819063 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 5042821691,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 203901763,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25600.870942000256,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 20151.747561 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 70344.506694,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 70344508000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4685.168179999891,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4000.0935009999994 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11865.927726,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11865929000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2325.19",
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
          "id": "5ff375219c58809a119a42cf96ec1b3ef43904f1",
          "message": "feat!: Indirect flag is now sorted by operand (#14184)\n\nPreviously, the indirect flag was LSB [operand_0_indirect,\noperand_1_indirect, operand_0_relative, operand_1_relative, ...0] MSB.\nThis made it so different amounts of operands would make the indirect\nflag have different meanings. This PR changes it to LSB\n[operand_0_indirect, operand_0_relative, operand_1_indirect ...] MSB\nThis way the meaning of the operand flag doesn't change with the number\nof operands, and we also avoid having to construct addressing with the\nconcrete operand count.",
          "timestamp": "2025-05-09T16:47:30Z",
          "tree_id": "517c992849ee2676af7c74fe1aa1f670f225b8a0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5ff375219c58809a119a42cf96ec1b3ef43904f1"
        },
        "date": 1746812632941,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24173,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1798,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 76826,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2181,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20862,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2340,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67522,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3158,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14370,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1083,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49095,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1700,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17754,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1265,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 57570,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1821,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12160,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1027,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41166,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1594,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21577,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1614,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 70739,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2165,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14000,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1104,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48206,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1609,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13201,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1060,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 43802,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1651,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "id": "4d1a7c839df7081da05c2086a6f312c8a405cc45",
          "message": "chore: Update the list of security bugs (#13825)\n\nReorganize the security bugs table and add a few new ones",
          "timestamp": "2025-05-09T16:55:25Z",
          "tree_id": "fa0223d9d477d05dc16c77d14d186aa3b9679b84",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4d1a7c839df7081da05c2086a6f312c8a405cc45"
        },
        "date": 1746812736004,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17808.413131999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14262.924554 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4862726118,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 200630754,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25232.696317999966,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19794.826651 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 70047.88158599999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 70047886000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4156.094309999958,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3477.8155009999996 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11507.006082,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11507010000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2325.19",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "distinct": false,
          "id": "904ed3de53f7e334feb0888be7523579e55b147b",
          "message": "chore(bb.js): remove plonk utils (#14180)",
          "timestamp": "2025-05-09T17:55:38Z",
          "tree_id": "daf4e975af34c393c1bbb1d6c314d7cd42c0fae4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/904ed3de53f7e334feb0888be7523579e55b147b"
        },
        "date": 1746818514102,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18135.053983000034,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14500.449171 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4918378469,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 201041861,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25750.64859600002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 20013.101894 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 70139.79743600001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 70139799000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4298.323681000056,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3728.7703930000002 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11534.304155,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11534305000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2325.19",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "cd3eb1bf0dae859e0a3b3f3a706df7d35b7be6a9",
          "message": "fix(cli): remove extra .split (#14170)\n\nIt is already parsed in the sequencers command\nfixes: https://github.com/AztecProtocol/aztec-packages/issues/14167",
          "timestamp": "2025-05-09T18:11:16Z",
          "tree_id": "58900f65b3ed2d9569d416dcb23b9e98ee350df1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cd3eb1bf0dae859e0a3b3f3a706df7d35b7be6a9"
        },
        "date": 1746818527840,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24356,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1775,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78304,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2214,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20919,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2361,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 69162,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3009,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14493,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1077,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48571,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1743,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17696,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1268,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58245,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1899,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12508,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1041,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42252,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1692,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21492,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1612,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 72567,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2144,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 13983,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1095,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48031,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1707,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13305,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1063,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44644,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1705,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "distinct": false,
          "id": "904ed3de53f7e334feb0888be7523579e55b147b",
          "message": "chore(bb.js): remove plonk utils (#14180)",
          "timestamp": "2025-05-09T17:55:38Z",
          "tree_id": "daf4e975af34c393c1bbb1d6c314d7cd42c0fae4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/904ed3de53f7e334feb0888be7523579e55b147b"
        },
        "date": 1746818530008,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24224,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1789,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77814,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2294,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21142,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2338,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67622,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3087,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14370,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1082,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49463,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1675,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17798,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1302,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 57826,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1866,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12285,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1023,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42343,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1596,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21707,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1612,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71009,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2163,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14116,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1097,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48339,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1718,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13215,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1062,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44874,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1679,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "id": "27eed71c797f86e2190e14bb95290d3c73131564",
          "message": "feat!: use given lengths to trim emitted logs (#14041)\n\n- All types of logs (private, public, contract class) will now be\nemitted from the contracts with a length. The base rollup will include\nthe logs to the blobs based on the specified length.\n\nRefactoring:\n- Change the prefixes of side effects in blobs to be the number of items\ninstead of the total fields of all items. It's cheaper to compute and\neasier to deserialise.\n- Remove `counter` from `LogHash` when outputted from private tail.\nCounter is only required when processing in private. We used to set it\nto 0 when exposing to public.\n\nRenaming:\n- Rename `[PUBLIC/CONTRACT_CLASS]_LOG_DATA_SIZE_IN_FIELDS ` to\n`[PUBLIC/CONTRACT_CLASS]_LOG_SIZE_IN_FIELDS ` to be consistent with\n`PRIVATE_LOG_SIZE_IN_FIELDS`.\n- Rename `[PUBLIC/CONTRACT_CLASS]_LOG_SIZE_IN_FIELDS ` to\n`[PUBLIC/CONTRACT_CLASS]_LOG_LENGTH` because other constants for a\nstruct's total number of fields are named `[...]_LENGTH`.",
          "timestamp": "2025-05-09T19:33:39Z",
          "tree_id": "1c8977b580d267bda7f41122d1dba607ad9bb4b0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/27eed71c797f86e2190e14bb95290d3c73131564"
        },
        "date": 1746821935049,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17862.829740999812,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14337.4586 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4935151919,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 199099954,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25289.27617799991,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19970.916192 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 69747.803212,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 69747805000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4303.738829000167,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3674.416387 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11591.950805,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11591954000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2325.19",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "27eed71c797f86e2190e14bb95290d3c73131564",
          "message": "feat!: use given lengths to trim emitted logs (#14041)\n\n- All types of logs (private, public, contract class) will now be\nemitted from the contracts with a length. The base rollup will include\nthe logs to the blobs based on the specified length.\n\nRefactoring:\n- Change the prefixes of side effects in blobs to be the number of items\ninstead of the total fields of all items. It's cheaper to compute and\neasier to deserialise.\n- Remove `counter` from `LogHash` when outputted from private tail.\nCounter is only required when processing in private. We used to set it\nto 0 when exposing to public.\n\nRenaming:\n- Rename `[PUBLIC/CONTRACT_CLASS]_LOG_DATA_SIZE_IN_FIELDS ` to\n`[PUBLIC/CONTRACT_CLASS]_LOG_SIZE_IN_FIELDS ` to be consistent with\n`PRIVATE_LOG_SIZE_IN_FIELDS`.\n- Rename `[PUBLIC/CONTRACT_CLASS]_LOG_SIZE_IN_FIELDS ` to\n`[PUBLIC/CONTRACT_CLASS]_LOG_LENGTH` because other constants for a\nstruct's total number of fields are named `[...]_LENGTH`.",
          "timestamp": "2025-05-09T19:33:39Z",
          "tree_id": "1c8977b580d267bda7f41122d1dba607ad9bb4b0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/27eed71c797f86e2190e14bb95290d3c73131564"
        },
        "date": 1746821948654,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24693,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1771,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78840,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2267,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21698,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2336,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 70118,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3064,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14628,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1079,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48266,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1664,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17777,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1263,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 57593,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1786,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12952,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1033,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42414,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1674,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 22371,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1657,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 73451,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2110,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14347,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1116,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48249,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1650,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13118,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1056,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 43956,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1732,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746846268756,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24389,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1798,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78184,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2289,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20783,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2319,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67858,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3068,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14450,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1081,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48273,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1701,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17885,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1308,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 57916,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1821,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12758,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1030,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42448,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1668,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21730,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1617,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71365,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2111,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14440,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1079,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48005,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1674,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13253,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1057,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44201,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1731,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1747047306211,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24224,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1755,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77273,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2289,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21149,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2303,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67985,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3071,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14541,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1077,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48743,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1691,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18032,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1266,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59005,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1834,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12621,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1032,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42184,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1535,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21611,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1655,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71392,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2116,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14528,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1097,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48387,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1645,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13372,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1057,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45000,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1678,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1747050643727,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24173,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1783,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78979,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2204,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20946,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2337,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 68421,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3093,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14881,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1074,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49376,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1736,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17915,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1269,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58728,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1887,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12623,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1010,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 43180,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1634,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21891,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1653,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71734,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2093,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14631,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1099,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 49373,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1654,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13441,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1055,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44764,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1820,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1747057936594,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17845.63974900004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14279.271658 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4794679770,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 202710280,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25546.753773999968,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19921.816584999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 70069.704902,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 70069705000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4340.523184000062,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3586.0007940000005 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11551.592191000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11551594000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2205.19",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
        "date": 1747057951234,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 23956,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1767,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 76640,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2260,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20817,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2305,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 66936,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3024,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14435,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1078,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48625,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1717,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18054,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1269,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59303,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1881,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12585,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1032,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41512,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1730,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21528,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1656,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71554,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2080,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14187,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1081,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48242,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1753,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13249,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1056,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45457,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1767,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1747058869546,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17979.92001900002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14206.220984 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4775372052,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 195906730,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25492.76774000009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19900.669847 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 70086.37886999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 70086381000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4352.944562000175,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3701.3590960000006 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11635.914372999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11635916000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2205.19",
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
          "id": "34eaa0ee0d80e56f9bb7d000c2f38cef57a1165f",
          "message": "fix(bb): honour CRS_PATH env var (#14208)",
          "timestamp": "2025-05-12T13:05:20Z",
          "tree_id": "ef4a34cfe586fb40d50aad19f9c1f78ec29cee1f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/34eaa0ee0d80e56f9bb7d000c2f38cef57a1165f"
        },
        "date": 1747058882259,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24388,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1773,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77150,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2269,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20999,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2315,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67357,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3084,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14583,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1074,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48890,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1753,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18043,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1307,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58496,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1905,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12744,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1028,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41538,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1651,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21802,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1617,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71150,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2068,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14445,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1096,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48990,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1684,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13480,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1096,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44403,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1730,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          }
        ]
      }
    ]
  }
}