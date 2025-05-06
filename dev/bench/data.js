window.BENCHMARK_DATA = {
  "lastUpdate": 1746542558895,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "C++ Benchmark": [
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
        "date": 1746041610692,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 17766,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 994,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 53111,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1812,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 17068,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 994,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 49282,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1819,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 29797,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1377,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 80413,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2059,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 16103,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 983,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 47724,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1831,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 21036,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1045,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 60118,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1860,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 13474,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 962,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41693,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1731,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 23937,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1323,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 67414,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1999,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 15724,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 977,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47708,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1796,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746041915977,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 17946,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 993,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 52328,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1852,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 16905,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 992,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 49037,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1773,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 29638,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1362,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 79611,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2155,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 16000,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 983,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48772,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1718,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 20993,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1050,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59428,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1825,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 13172,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 965,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 40741,
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
            "value": 23896,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1328,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 66359,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2179,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 15823,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 979,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48007,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1782,
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
          "id": "897c49b6c3a0d428173275628f1e50fbdad8e42b",
          "message": "feat: github-action-benchmark reporting for public simulation (#13938)\n\nGH pages page is here:\nhttps://aztecprotocol.github.io/aztec-packages/dev/sim-bench/\n\n(I temporarily removed the `if` condition for the ci steps so that\nthey'd generate gh-action-benchmark commits/points for my PR)\n\nAfter seeing the alert below at 110% threshold that I believe was just\ndue to general variability in simulation times, I bumped the alert\nthreshold to 200%. That's kind of a bummer because ideally I'd like to\nget notified if #instructions executed grows by even ~5%, but the\nduration metrics vary more widely from run to run.\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-04-30T19:09:02Z",
          "tree_id": "b1a081012f5fa3e8873a33adade5d5438aafe01f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/897c49b6c3a0d428173275628f1e50fbdad8e42b"
        },
        "date": 1746042687680,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 17827,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 996,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 52704,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1794,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 16837,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 990,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 49125,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1778,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 29632,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1382,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 80697,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2149,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 16269,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 982,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48483,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1763,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 20851,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1045,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59045,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1810,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 13226,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 961,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42215,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1698,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 23938,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1338,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 66998,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2102,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 15691,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 976,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47714,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1784,
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
          "id": "6585142c92d64bdc05d570f6ee3f4b5ee1b5ae79",
          "message": "fix!: cycle group fix (results in protocol circuit changes) (#13970)\n\nFixes https://github.com/AztecProtocol/barretenberg/issues/1374",
          "timestamp": "2025-04-30T19:49:06Z",
          "tree_id": "764cb590b6a03cb70b01f4b0e12ae6dd26a286ef",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6585142c92d64bdc05d570f6ee3f4b5ee1b5ae79"
        },
        "date": 1746046802777,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17692.430003000027,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14242.762765 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2217761023,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 201136667,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20352.55409199999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17514.329016 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56227.249657,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56227252000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4476.84912800014,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3962.6665430000003 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12143.090203,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12143093000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2344.06",
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
          "id": "6585142c92d64bdc05d570f6ee3f4b5ee1b5ae79",
          "message": "fix!: cycle group fix (results in protocol circuit changes) (#13970)\n\nFixes https://github.com/AztecProtocol/barretenberg/issues/1374",
          "timestamp": "2025-04-30T19:49:06Z",
          "tree_id": "764cb590b6a03cb70b01f4b0e12ae6dd26a286ef",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6585142c92d64bdc05d570f6ee3f4b5ee1b5ae79"
        },
        "date": 1746046814105,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 17925,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 993,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 53243,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1766,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 16812,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 993,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 48631,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1801,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 29892,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1375,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 80358,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2074,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 16274,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 983,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 47870,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1749,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 20999,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1045,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59178,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1823,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 13217,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 965,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41644,
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
            "value": 24061,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1336,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 66090,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2132,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 15787,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 976,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 46012,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1691,
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
          "id": "c1cbbadfca7e48cc892c818da16a62fd596fcc5a",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"58fd8174c5\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"58fd8174c5\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-05-01T02:34:19Z",
          "tree_id": "c69f068f9e6d6259cc2695f89afe1b667835960a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c1cbbadfca7e48cc892c818da16a62fd596fcc5a"
        },
        "date": 1746069052375,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 18183,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 997,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 53603,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1828,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 17090,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 992,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 48683,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1853,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 29447,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1380,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 79350,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2106,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 16182,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 982,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 47958,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1794,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 21158,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1047,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59760,
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
            "value": 13679,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 963,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 43174,
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
            "value": 23692,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1336,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 66157,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2133,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 15682,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 977,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 46431,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1792,
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
          "distinct": true,
          "id": "0565b2d9c38dc55406eff514e695c829d1bd83c5",
          "message": "chore: codeowner and changetest (#13962)\n\nAdds a new test that do some minimal checks to catch if the contract\ncode have been changed, and add the turtles as codeowners for the test.\n\nThat way, we should be able to somewhat avoid not noticing if there are\nchanges made to the contracts. It only check a few of the contracts;\n`rollup`, `governance` and `registry` as those are the big ones and\nshould deal with most changes.\n\nI only do codeowners on this one file instead of the dir as we don't to\nbe notified around extra tests or things that would not really cause a\nproblem if used for nodes.",
          "timestamp": "2025-05-01T07:44:20Z",
          "tree_id": "b8bb8afcc6f7805cdbb20ca023258f30a1e082f5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0565b2d9c38dc55406eff514e695c829d1bd83c5"
        },
        "date": 1746087560172,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 17949,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 994,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 52944,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1799,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 16541,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 991,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 48349,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1876,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 29618,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1374,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 79829,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2073,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 15828,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 981,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48344,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1722,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 21184,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1048,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59359,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1810,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 13166,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 963,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41410,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1817,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 23752,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1330,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 66033,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2197,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 15601,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 977,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47125,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1676,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "id": "1c63984ea112d03669c34b8286f0db62acfc6d27",
          "message": "feat(docs): applying dogfooding feedback in docs (#13920)\n\n- addresses feedback\n- updates getting started to be tabbed sandbox/testnet\n- updates contract tutorials and versioned\n\n---------\n\nCo-authored-by: Josh Crites <jc@joshcrites.com>\nCo-authored-by: josh crites <critesjosh@gmail.com>\nCo-authored-by: James Zaki <james.zaki@proton.me>",
          "timestamp": "2025-05-01T08:55:03Z",
          "tree_id": "df7493aea8c314e78913ba40e1631ccc2a449ef0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1c63984ea112d03669c34b8286f0db62acfc6d27"
        },
        "date": 1746092214057,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 17690,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 993,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 52823,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1741,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 17173,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 992,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 48647,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1835,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 29675,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1377,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 80758,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2147,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 16144,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 978,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 47319,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1812,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 20743,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1044,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59091,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1778,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 13435,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 963,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42890,
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
            "value": 24076,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1326,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 67018,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2092,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 15701,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 979,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47256,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1752,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "id": "1ae0383ea63a047d2097898334227d1e8d6d6591",
          "message": "chore: Bump Noir reference (#13906)\n\nAutomated pull of nightly from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nfeat: add `--debug-compile-stdin` to read `main.nr` from `STDIN` for\ntesting (https://github.com/noir-lang/noir/pull/8253)\nfeat: better error message on unicode whitespace that isn't ascii\nwhitespace (https://github.com/noir-lang/noir/pull/8295)\nchore: update `quicksort` from iterative `noir_sort` version\n(https://github.com/noir-lang/noir/pull/7348)\nfix: use correct meta attribute names in contract custom attributes\n(https://github.com/noir-lang/noir/pull/8273)\nfeat: `nargo expand` to show code after macro expansions\n(https://github.com/noir-lang/noir/pull/7613)\nfeat: allow specifying fuzz-related dirs when invoking `nargo test`\n(https://github.com/noir-lang/noir/pull/8293)\nchore: redo typo PR by ciaranightingale\n(https://github.com/noir-lang/noir/pull/8292)\nchore: Extend the bug list with issues found by the AST fuzzer\n(https://github.com/noir-lang/noir/pull/8285)\nfix: don't disallow writing to memory after passing it to brillig\n(https://github.com/noir-lang/noir/pull/8276)\nchore: test against zkpassport rsa lib\n(https://github.com/noir-lang/noir/pull/8278)\nfeat: omit element size array for more array types\n(https://github.com/noir-lang/noir/pull/8257)\nchore: refactor array handling in ACIRgen\n(https://github.com/noir-lang/noir/pull/8256)\nchore: document cast (https://github.com/noir-lang/noir/pull/8268)\nEND_COMMIT_OVERRIDE\n\n---------\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2025-05-01T10:02:47Z",
          "tree_id": "e26d7004a8bf1f7a1cb67c47d58e90c0bc92afbe",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1ae0383ea63a047d2097898334227d1e8d6d6591"
        },
        "date": 1746096441465,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 18055,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 995,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 53149,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1752,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 16788,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 993,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 49221,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1792,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 29627,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1377,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 80245,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2133,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 16121,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 982,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48535,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1739,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 20960,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1046,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59215,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1826,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 13502,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 963,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42227,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1659,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 23786,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1330,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 67017,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2152,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 15544,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 976,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47146,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1696,
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
          "id": "e032787d31f1d54622b51f38d30926beeb0e4b16",
          "message": "feat: txe state machine (#13836)\n\nThis PR removes the TXe node with an implementation of a TXe state\nmachine which combines an aztec node, and a custom archiver /\nsynchronizer.\n\nNote: Because of the extension of `ArchiverStoreHelper`, there was a\nclash of `getBlocks`, in one interface it was expected to receive\n`L2Blocks`, and in the other `PublishedBlocks`. To solve this, I have\nrenamed `getBlocks` on the `ArchiverStoreHelper` to\n`getPublishedBlocks`. But doing so I also did the same renaming on the\nArchiverDataStore because it seems to better match the signature\nanyways.",
          "timestamp": "2025-05-01T11:58:59Z",
          "tree_id": "49b79e3cc727ff808a0292232131a3a73ab2d254",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e032787d31f1d54622b51f38d30926beeb0e4b16"
        },
        "date": 1746103211367,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 17973,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 1003,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 52528,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1805,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 16818,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 1001,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 49048,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1767,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 29705,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1382,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 80869,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2078,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 15915,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 983,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 47699,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1796,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 20898,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1044,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59246,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1759,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 13217,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 965,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41865,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1644,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 23840,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1324,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 66871,
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
            "value": 15778,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 977,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 45956,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1765,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "id": "7018daa67b6c16de2393990457d0c47f31778a82",
          "message": "chore: use separate KV store for lip2p peers + logging missing txs (#13967)",
          "timestamp": "2025-05-01T12:41:15Z",
          "tree_id": "4b8cb2072d68cf0fce3e1a254cc6bd79932ed03d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7018daa67b6c16de2393990457d0c47f31778a82"
        },
        "date": 1746105835950,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 17789,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 992,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 52143,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1855,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 16807,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 991,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 49091,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1774,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 29762,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1373,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 80570,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2160,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 16153,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 979,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48468,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1774,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 21029,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1044,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59035,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1730,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 13236,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 963,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42127,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1769,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 23953,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1322,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 67401,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2066,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 15885,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 977,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47567,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1735,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "id": "64f106c46159fa7c21a42288580d6e8f47348d42",
          "message": "chore: redo typo PR by Maximilian199603 (#13992)\n\nThanks Maximilian199603 for\nhttps://github.com/AztecProtocol/aztec-packages/pull/13983. Our policy\nis to redo typo changes to dissuade metric farming. This is an automated\nscript.\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-01T13:30:06Z",
          "tree_id": "a99aca4d50c745662f745b8264c8c5598d8f061e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/64f106c46159fa7c21a42288580d6e8f47348d42"
        },
        "date": 1746108704122,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 18005,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 991,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 52656,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1749,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 16750,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 991,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 48879,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1791,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 29741,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1378,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 79854,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2126,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 16170,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 981,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48701,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1663,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 21102,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1049,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58386,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1794,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 13309,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 959,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42537,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1678,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 23945,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1328,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 67403,
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
            "value": 15739,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 978,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47367,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1773,
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
          "id": "8a77df7cf1f2b25fc2cb06a1d71aacc0e93c5ba2",
          "message": "fix(cmake): clientivc uses libdeflate (#13973)",
          "timestamp": "2025-05-01T14:26:05Z",
          "tree_id": "14e8e0c6c34691c03cc29e6d7c9ed5a2f5743ef8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8a77df7cf1f2b25fc2cb06a1d71aacc0e93c5ba2"
        },
        "date": 1746112341700,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17502.062147999823,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13962.562567 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2191890123,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 197604879,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20139.54649499988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17232.590505 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56113.033034,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56113037000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4444.920320000165,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3808.3842119999995 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12017.309726,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12017310000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2344.06",
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
          "id": "8a77df7cf1f2b25fc2cb06a1d71aacc0e93c5ba2",
          "message": "fix(cmake): clientivc uses libdeflate (#13973)",
          "timestamp": "2025-05-01T14:26:05Z",
          "tree_id": "14e8e0c6c34691c03cc29e6d7c9ed5a2f5743ef8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8a77df7cf1f2b25fc2cb06a1d71aacc0e93c5ba2"
        },
        "date": 1746112355022,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 18341,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 997,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 53802,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1877,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 17368,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 992,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 49896,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1876,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 30452,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1381,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 82694,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2176,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 16600,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 981,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49357,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1719,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 21756,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1045,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 61383,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1819,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 14005,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 962,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 43887,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1785,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 24562,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1329,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 68771,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2042,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 16102,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 978,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 49093,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1641,
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
          "id": "8c530294087363dc41785fad4cb19bdd422385da",
          "message": "fix: make zod deserialization of SimulationErrors less strict (#13976) (#13998)\n\ncherry-picked from `alpha-testnet`\nhttps://github.com/AztecProtocol/aztec-packages/pull/13976\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-01T14:56:51Z",
          "tree_id": "241e5acbf341e24ce91ef4f879b4b252307f1713",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8c530294087363dc41785fad4cb19bdd422385da"
        },
        "date": 1746113891533,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 17947,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 994,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 51834,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1870,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 16728,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 989,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 49215,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1738,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 29667,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1364,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 81032,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2095,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 16134,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 982,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48342,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1749,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 21232,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1045,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59290,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1825,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 13359,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 963,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41631,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1714,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 24021,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1322,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 66715,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2128,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 15763,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 976,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 46869,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1820,
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
          "id": "e4ee6e9c505a30953ce4e7dace56f05de7885f33",
          "message": "feat!: GETCONTRACTINSTANCE opcode has 1 dstOffset operand where dstOffset gets exists and dstOffset+1 gets instance member (#13971)\n\nThis is easier to constrain in the AVM as otherwise it is the only\nopcode with two destination offset operands.\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-01T18:32:00Z",
          "tree_id": "b15736eea6598650d98f3c0fa821e38a021aed08",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e4ee6e9c505a30953ce4e7dace56f05de7885f33"
        },
        "date": 1746127166428,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17909.276237000086,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13987.474951999999 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2222934667,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 198275697,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20092.842123000082,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17163.793721000002 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55723.887436,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55723889000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4404.770807999739,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3865.2641779999994 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11921.687533999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11921692000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2344.06",
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
          "id": "e4ee6e9c505a30953ce4e7dace56f05de7885f33",
          "message": "feat!: GETCONTRACTINSTANCE opcode has 1 dstOffset operand where dstOffset gets exists and dstOffset+1 gets instance member (#13971)\n\nThis is easier to constrain in the AVM as otherwise it is the only\nopcode with two destination offset operands.\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-01T18:32:00Z",
          "tree_id": "b15736eea6598650d98f3c0fa821e38a021aed08",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e4ee6e9c505a30953ce4e7dace56f05de7885f33"
        },
        "date": 1746127180134,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 17751,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 992,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 52918,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1705,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 16651,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 992,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 48550,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1856,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 29576,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1388,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 80617,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2115,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 15956,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 982,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 47857,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1692,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 20871,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1046,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59544,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1801,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 13330,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 963,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42526,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1762,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 24039,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1325,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 67597,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2049,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 15617,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 977,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47607,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1803,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "mike@aztecprotocol.com",
            "name": "Michael Connor",
            "username": "iAmMichaelConnor"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "ff32e15889f519dc9c556906faaf5f07410c551c",
          "message": "docs: script to unravel deeply nested protocol circuit structs, for readability (#14006)\n\nSpecify the name of a struct that you cannot be bothered tracing through\nthe `nr` codebase.\nIt'll unravel it for you.\n\nThis has already helped me find some potential issues.\n\nE.g. this is the output of unravelling `PrivateCircuitPublicInputs`:\n\n```noir\napp_public_inputs: PrivateCircuitPublicInputs {\n    call_context: CallContext {\n        msg_sender: AztecAddress {\n            inner: Field,\n        },\n        contract_address: AztecAddress {\n            inner: Field,\n        },\n        function_selector: FunctionSelector {\n            inner: u32,\n        },\n        is_static_call: bool,\n    },\n    args_hash: Field,\n    returns_hash: Field,\n    min_revertible_side_effect_counter: u32,\n    is_fee_payer: bool,\n    max_block_number: MaxBlockNumber {\n        _opt: Option {\n            _is_some: bool,\n            _value: u32,\n        },\n    },\n    note_hash_read_requests: [\n        ReadRequest {\n            value: Field,\n            counter: u32,\n        };\n        16,\n    ],\n    nullifier_read_requests: [\n        ReadRequest {\n            value: Field,\n            counter: u32,\n        };\n        16,\n    ],\n    key_validation_requests_and_generators: [\n        KeyValidationRequestAndGenerator {\n            request: KeyValidationRequest {\n                pk_m: EmbeddedCurvePoint {\n                    x: Field,\n                    y: Field,\n                    is_infinite: bool,\n                },\n                sk_app: Field,\n            },\n            sk_app_generator: Field,\n        };\n        16,\n    ],\n    note_hashes: [\n        NoteHash {\n            value: Field,\n            counter: u32,\n        };\n        16,\n    ],\n    nullifiers: [\n        Nullifier {\n            value: Field,\n            counter: u32,\n            note_hash: Field,\n        };\n        16,\n    ],\n    private_call_requests: [\n        PrivateCallRequest {\n            call_context: CallContext {\n                msg_sender: AztecAddress {\n                    inner: Field,\n                },\n                contract_address: AztecAddress {\n                    inner: Field,\n                },\n                function_selector: FunctionSelector {\n                    inner: u32,\n                },\n                is_static_call: bool,\n            },\n            args_hash: Field,\n            returns_hash: Field,\n            start_side_effect_counter: u32,\n            end_side_effect_counter: u32,\n        };\n        5,\n    ],\n    public_call_requests: [\n        Counted {\n            inner: PublicCallRequest {\n                msg_sender: AztecAddress {\n                    inner: Field,\n                },\n                contract_address: AztecAddress {\n                    inner: Field,\n                },\n                is_static_call: bool,\n                calldata_hash: Field,\n            },\n            counter: u32,\n        };\n        16,\n    ],\n    public_teardown_call_request: PublicCallRequest {\n        msg_sender: AztecAddress {\n            inner: Field,\n        },\n        contract_address: AztecAddress {\n            inner: Field,\n        },\n        is_static_call: bool,\n        calldata_hash: Field,\n    },\n    l2_to_l1_msgs: [\n        L2ToL1Message {\n            recipient: EthAddress {\n                inner: Field,\n            },\n            content: Field,\n            counter: u32,\n        };\n        2,\n    ],\n    private_logs: [\n        PrivateLogData {\n            log: Log {\n                fields: [\n                    Field;\n                    18,\n                ],\n            },\n            note_hash_counter: u32,\n            counter: u32,\n        };\n        16,\n    ],\n    contract_class_logs_hashes: [\n        LogHash {\n            value: Field,\n            counter: u32,\n            length: u32,\n        };\n        1,\n    ],\n    start_side_effect_counter: u32,\n    end_side_effect_counter: u32,\n    historical_header: BlockHeader {\n        last_archive: AppendOnlyTreeSnapshot {\n            root: Field,\n            next_available_leaf_index: u32,\n        },\n        content_commitment: ContentCommitment {\n            num_txs: Field,\n            blobs_hash: Field,\n            in_hash: Field,\n            out_hash: Field,\n        },\n        state: StateReference {\n            l1_to_l2_message_tree: AppendOnlyTreeSnapshot {\n                root: Field,\n                next_available_leaf_index: u32,\n            },\n            partial: PartialStateReference {\n                note_hash_tree: AppendOnlyTreeSnapshot {\n                    root: Field,\n                    next_available_leaf_index: u32,\n                },\n                nullifier_tree: AppendOnlyTreeSnapshot {\n                    root: Field,\n                    next_available_leaf_index: u32,\n                },\n                public_data_tree: AppendOnlyTreeSnapshot {\n                    root: Field,\n                    next_available_leaf_index: u32,\n                },\n            },\n        },\n        global_variables: GlobalVariables {\n            chain_id: Field,\n            version: Field,\n            block_number: Field,\n            slot_number: Field,\n            timestamp: u64,\n            coinbase: EthAddress {\n                inner: Field,\n            },\n            fee_recipient: AztecAddress {\n                inner: Field,\n            },\n            gas_fees: GasFees {\n                fee_per_da_gas: Field,\n                fee_per_l2_gas: Field,\n            },\n        },\n        total_fees: Field,\n        total_mana_used: Field,\n    },\n    tx_context: TxContext {\n        chain_id: Field,\n        version: Field,\n        gas_settings: GasSettings {\n            gas_limits: Gas {\n                da_gas: u32,\n                l2_gas: u32,\n            },\n            teardown_gas_limits: Gas {\n                da_gas: u32,\n                l2_gas: u32,\n            },\n            max_fees_per_gas: GasFees {\n                fee_per_da_gas: Field,\n                fee_per_l2_gas: Field,\n            },\n            max_priority_fees_per_gas: GasFees {\n                fee_per_da_gas: Field,\n                fee_per_l2_gas: Field,\n            },\n        },\n    },\n};\n```",
          "timestamp": "2025-05-01T19:39:28Z",
          "tree_id": "494738671548426bcdcd34af1df86e0acd3a63e8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ff32e15889f519dc9c556906faaf5f07410c551c"
        },
        "date": 1746131445827,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 18065,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 992,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 53218,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1681,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 17028,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 992,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 48937,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1774,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 29802,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1374,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 80212,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2116,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 16299,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 983,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 47573,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1797,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 21379,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1047,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58458,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1837,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 13352,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 963,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42475,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1733,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 24011,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1326,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 67064,
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
            "value": 15711,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 977,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 46956,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1740,
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
          "id": "199648fe3d9d5c303a53ad8016d7217f2dbefcde",
          "message": "chore: comment civc trace size log parsing (#13975)\n\nGrego is relying on this format and we've changed it a few times lately,\na comment is prudent",
          "timestamp": "2025-05-01T19:16:49Z",
          "tree_id": "2f7eb4ca39583c4baed6fb428c2abb7910a80f88",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/199648fe3d9d5c303a53ad8016d7217f2dbefcde"
        },
        "date": 1746131795756,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17726.315055000214,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13805.668909 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2229378007,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 198883633,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20181.968433000293,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17307.210335 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56136.753844,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56136756000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4466.802900999937,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3851.4855519999996 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12262.179157000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12262183000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2263.88",
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
          "id": "199648fe3d9d5c303a53ad8016d7217f2dbefcde",
          "message": "chore: comment civc trace size log parsing (#13975)\n\nGrego is relying on this format and we've changed it a few times lately,\na comment is prudent",
          "timestamp": "2025-05-01T19:16:49Z",
          "tree_id": "2f7eb4ca39583c4baed6fb428c2abb7910a80f88",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/199648fe3d9d5c303a53ad8016d7217f2dbefcde"
        },
        "date": 1746131808498,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 18014,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 992,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 53629,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1804,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 17008,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 993,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 49643,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1818,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 29826,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1367,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 81014,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2125,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 16210,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 979,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48460,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1738,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 21127,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1044,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59785,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1800,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 13354,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 961,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42329,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1761,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 23994,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1323,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 67507,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2106,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 15722,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 977,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47698,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1736,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "id": "117ed54cd4bd947f03c15f65cbd2ce312b006ff4",
          "message": "feat: brittle benchmark for UH RV in Ultra gate count (#14008)\n\nAugments UltraRecursiveVerifier test by adding a gate count pinning\ncheck, so we can keep track of the Ultra gate count of a\nMegaZKRecursiveVerifier.\n\nHelps in closing\nhttps://github.com/AztecProtocol/barretenberg/issues/1380 because I\nneeded a measurement of the impact of an optimization.",
          "timestamp": "2025-05-01T21:14:25Z",
          "tree_id": "4084158f6a4253e6b124c2c614b83a6af94ab64b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/117ed54cd4bd947f03c15f65cbd2ce312b006ff4"
        },
        "date": 1746138718883,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17589.455023000028,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14081.82486 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2269599736,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 201494984,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20278.548829999636,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17180.521401 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56085.539339999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56085541000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4434.021915000358,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3834.9913049999996 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12091.564593000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12091567000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2263.88",
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
          "id": "117ed54cd4bd947f03c15f65cbd2ce312b006ff4",
          "message": "feat: brittle benchmark for UH RV in Ultra gate count (#14008)\n\nAugments UltraRecursiveVerifier test by adding a gate count pinning\ncheck, so we can keep track of the Ultra gate count of a\nMegaZKRecursiveVerifier.\n\nHelps in closing\nhttps://github.com/AztecProtocol/barretenberg/issues/1380 because I\nneeded a measurement of the impact of an optimization.",
          "timestamp": "2025-05-01T21:14:25Z",
          "tree_id": "4084158f6a4253e6b124c2c614b83a6af94ab64b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/117ed54cd4bd947f03c15f65cbd2ce312b006ff4"
        },
        "date": 1746138731637,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 18002,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 996,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 53070,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1732,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 16969,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 993,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 49142,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1797,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 29814,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1367,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 80581,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2129,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 16084,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 981,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48478,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1745,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 20959,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1049,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59178,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1827,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 13383,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 963,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42049,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1796,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 24026,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1328,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 66863,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2105,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 15741,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 977,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47968,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1692,
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
          "id": "b526d3b71db1ad0c5e13773d0affe5dd298d3d0b",
          "message": "feat: detect CIVC standalone VKs changing in CI (#13858)\n\nAdd functionality for previously unused `bb check` when ran in CIVC\nmode. Now checks an input stack, asserting that the same VKs would be\nwritten out.\n\nThis validates the recent fixes to VK generation.\n\n---------\n\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>",
          "timestamp": "2025-05-01T21:30:52Z",
          "tree_id": "fe898a542f76202fbaa7c482b103e0f98c9140c1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b526d3b71db1ad0c5e13773d0affe5dd298d3d0b"
        },
        "date": 1746139891005,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17738.39465600031,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13901.403374 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2235761214,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 199743252,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20390.09600700001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17177.383554 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56213.280393,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56213282000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4380.492620000041,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3780.266421 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12189.130462999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12189135000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2263.88",
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
          "id": "b526d3b71db1ad0c5e13773d0affe5dd298d3d0b",
          "message": "feat: detect CIVC standalone VKs changing in CI (#13858)\n\nAdd functionality for previously unused `bb check` when ran in CIVC\nmode. Now checks an input stack, asserting that the same VKs would be\nwritten out.\n\nThis validates the recent fixes to VK generation.\n\n---------\n\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>",
          "timestamp": "2025-05-01T21:30:52Z",
          "tree_id": "fe898a542f76202fbaa7c482b103e0f98c9140c1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b526d3b71db1ad0c5e13773d0affe5dd298d3d0b"
        },
        "date": 1746139905177,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 17810,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 994,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 51647,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1747,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 17038,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 994,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 48720,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1821,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 29960,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1371,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 80157,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2168,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 16220,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 982,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 47177,
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
            "value": 21218,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1049,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58587,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1913,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 13289,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 962,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41416,
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
            "value": 24122,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1321,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 66451,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2079,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 15839,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 977,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 46812,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1747,
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
          "id": "d19dfd1c16f64748fdddb6b85602755e1e02aaba",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"1ead03ed81\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"1ead03ed81\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-05-02T02:31:33Z",
          "tree_id": "43bab8b7ff645f73236e153e0de7501148825bb8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d19dfd1c16f64748fdddb6b85602755e1e02aaba"
        },
        "date": 1746155366570,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 18012,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 1001,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 52022,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1837,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 16931,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 993,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 48193,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1858,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 29833,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1388,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 80143,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2221,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 16223,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 984,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 47602,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1831,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 21155,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1044,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58660,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1909,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 13190,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 964,
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
            "value": 1804,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 24084,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1329,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 66555,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2159,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 15594,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 978,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 46822,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1883,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "id": "19da0fb437f338e2e5fc1ecbca7eb9feb3a03227",
          "message": "chore: Bump Noir reference (#14017)\n\nAutomated pull of nightly from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nfeat: disallow emitting multiple `MemoryInit` opcodes for the same block\n(https://github.com/noir-lang/noir/pull/8291)\nfix(ssa): Remove unused calls to pure functions\n(https://github.com/noir-lang/noir/pull/8298)\nfix(ssa): Do not remove unused checked binary ops\n(https://github.com/noir-lang/noir/pull/8303)\nfix: Return zero and insert an assertion if RHS bit size is over the\nlimit in euclidian division\n(https://github.com/noir-lang/noir/pull/8294)\nfeat: remove unnecessary dynamic arrays when pushing onto slices\n(https://github.com/noir-lang/noir/pull/8287)\nfeat(testing): Add SSA interpreter for testing SSA\n(https://github.com/noir-lang/noir/pull/8115)\nEND_COMMIT_OVERRIDE\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-02T10:45:35Z",
          "tree_id": "0ef14af234f08e53694e5060525c84a643b7223a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/19da0fb437f338e2e5fc1ecbca7eb9feb3a03227"
        },
        "date": 1746186488071,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 16409,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 1286,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 54007,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2770,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 15330,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 1280,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 50074,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2932,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 26689,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 3973,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 83868,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 4680,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14877,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1163,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48947,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2418,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18650,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1434,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 60284,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3400,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12840,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1115,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42500,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2049,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21667,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 3026,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 68744,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3811,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14636,
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
            "value": 48079,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2399,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "id": "5276489d0e271fe1d852518dfb46577e6413534e",
          "message": "feat!: swap copyOffset and dataOffset operands (#14000)\n\nSimilar to the changes to return / revert. \n\nThe copySizeOffset and dataOffset operands are swapped for cdCopy,\nrdCopy and Call to match retrun/revert",
          "timestamp": "2025-05-02T11:16:17Z",
          "tree_id": "6ff9bdfd892b1e351bad1d5adcecd86dccc7a264",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5276489d0e271fe1d852518dfb46577e6413534e"
        },
        "date": 1746188080092,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 16441,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 1293,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 53412,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2868,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 15215,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 1288,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 49912,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2754,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 26506,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 3914,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 84787,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 4692,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 15001,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1201,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 47917,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2509,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18492,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1418,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59868,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3288,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12909,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1115,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41242,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2031,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21679,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 3021,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 69750,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3787,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14525,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1204,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47047,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2355,
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
          "id": "1fb70a4a983da2fd775f833b45ec4d83f5a2b08b",
          "message": "feat(avm): Evolve public data read to read/write (#13486)\n\nEvolves the public data read gadget to a checker gadget with both read\nand write. It's very similar to the nullifier one but handling the\nupdate case instead of failing in that case.\n\n---------\n\nCo-authored-by: jeanmon <jean@aztec-labs.com>",
          "timestamp": "2025-05-02T13:26:33Z",
          "tree_id": "760daad76b3d4a843a843e2c7e98cdc41836f70e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1fb70a4a983da2fd775f833b45ec4d83f5a2b08b"
        },
        "date": 1746197143284,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17672.144008000032,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13871.097801 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2257337135,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 200110947,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20276.408475000153,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17348.936938000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56379.51072,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56379513000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4451.889780000329,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3771.190265 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12168.494414,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12168498000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2215.88",
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
          "id": "1fb70a4a983da2fd775f833b45ec4d83f5a2b08b",
          "message": "feat(avm): Evolve public data read to read/write (#13486)\n\nEvolves the public data read gadget to a checker gadget with both read\nand write. It's very similar to the nullifier one but handling the\nupdate case instead of failing in that case.\n\n---------\n\nCo-authored-by: jeanmon <jean@aztec-labs.com>",
          "timestamp": "2025-05-02T13:26:33Z",
          "tree_id": "760daad76b3d4a843a843e2c7e98cdc41836f70e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1fb70a4a983da2fd775f833b45ec4d83f5a2b08b"
        },
        "date": 1746197155816,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 16412,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 1311,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 53442,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2636,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 15427,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 1262,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 49917,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2877,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 26493,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 3879,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 83839,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 4700,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14853,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1172,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48107,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2355,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18724,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1407,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 60774,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3377,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12890,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1117,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41943,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1942,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21570,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 2805,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 69081,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 4014,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14351,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1174,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47616,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2362,
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
          "id": "9d1d63c91860d2a8d8274fd1761efe0c419f5c12",
          "message": "fix!: fix hiding circuit VK consistency in overflow case (#14011)\n\nPrior to this update, the PG recursive verifier was not treating the\ncircuit size and log circuit size as witnesses. This led to the\n`padding_indicator_array` used in the decider recursive verifier in the\nhiding circuit being populated with constant values. This is turn led to\ndifferent constraints in the case where the accumulator had a circuit\nsize larger than the nominal one determined by the structured trace\n(which occurs when the overflow mechanism is active for example).\n\nThis PR makes those values witnesses and adds an additional CIVC VK\nconsistency test for the case where one or more of the circuits\noverflows and results in an accumulator with larger dyadic size than the\nnominal structured trace dyadic size.\n\n---------\n\nCo-authored-by: sergei iakovenko <105737703+iakovenkos@users.noreply.github.com>",
          "timestamp": "2025-05-02T13:39:15Z",
          "tree_id": "8607a58002fc04b33e1853e470161e1fa299b66d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9d1d63c91860d2a8d8274fd1761efe0c419f5c12"
        },
        "date": 1746197948771,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17615.862299999662,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14262.775683000002 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2258748670,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 201203176,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20381.023281000125,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17296.007627 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56742.380191000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56742382000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4471.131203999903,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3905.07638 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12187.217036,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12187221000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2215.88",
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
          "id": "9d1d63c91860d2a8d8274fd1761efe0c419f5c12",
          "message": "fix!: fix hiding circuit VK consistency in overflow case (#14011)\n\nPrior to this update, the PG recursive verifier was not treating the\ncircuit size and log circuit size as witnesses. This led to the\n`padding_indicator_array` used in the decider recursive verifier in the\nhiding circuit being populated with constant values. This is turn led to\ndifferent constraints in the case where the accumulator had a circuit\nsize larger than the nominal one determined by the structured trace\n(which occurs when the overflow mechanism is active for example).\n\nThis PR makes those values witnesses and adds an additional CIVC VK\nconsistency test for the case where one or more of the circuits\noverflows and results in an accumulator with larger dyadic size than the\nnominal structured trace dyadic size.\n\n---------\n\nCo-authored-by: sergei iakovenko <105737703+iakovenkos@users.noreply.github.com>",
          "timestamp": "2025-05-02T13:39:15Z",
          "tree_id": "8607a58002fc04b33e1853e470161e1fa299b66d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9d1d63c91860d2a8d8274fd1761efe0c419f5c12"
        },
        "date": 1746197962842,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 16474,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 1301,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 53632,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2848,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 15221,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 1287,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 49994,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2771,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 26570,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 3663,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 84607,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 4474,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14906,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1180,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 47956,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2394,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18559,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1389,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 60013,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3406,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12976,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1124,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42701,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1893,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21640,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 2786,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 69802,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3811,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14502,
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
            "value": 47317,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2444,
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
          "id": "9d35213a970dede4c094f639754f6ac058cf3b1e",
          "message": "fix: pippenger buffer overflow if threads > 128 (#14039)\n\nGiven how heavy MSMs are, this was definitely a bad micro-optimization.\nIt was missing an assert, at the least. Added one for round count.",
          "timestamp": "2025-05-02T19:26:51Z",
          "tree_id": "2d3f48f01a799820f0a048973a741d7974155977",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9d35213a970dede4c094f639754f6ac058cf3b1e"
        },
        "date": 1746218749321,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17764.310208000097,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13891.540042 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2185620657,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 196277186,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20090.099253000062,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17041.65224 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55581.033141,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55581035000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4330.305910999414,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3699.1051860000007 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11834.871111,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11834875000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2215.88",
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
          "id": "9d35213a970dede4c094f639754f6ac058cf3b1e",
          "message": "fix: pippenger buffer overflow if threads > 128 (#14039)\n\nGiven how heavy MSMs are, this was definitely a bad micro-optimization.\nIt was missing an assert, at the least. Added one for round count.",
          "timestamp": "2025-05-02T19:26:51Z",
          "tree_id": "2d3f48f01a799820f0a048973a741d7974155977",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9d35213a970dede4c094f639754f6ac058cf3b1e"
        },
        "date": 1746218762121,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 16225,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 1290,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 53702,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2777,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 15209,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 1275,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 50308,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2828,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 26246,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 3888,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 83924,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 4620,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14777,
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
            "value": 48358,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2270,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18583,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1405,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 60290,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3437,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12780,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1113,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42249,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2079,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21416,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 2982,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 69262,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3708,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14626,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1181,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47564,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2613,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "isennovskiy@gmail.com",
            "name": "Innokentii Sennovskii",
            "username": "Rumata888"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "6bf07d407f2d797152d9251c3c1654efd4240102",
          "message": "fix: Fixing PG recursive verifier FS break (#14004)\n\nThere was a\n[vulnerability](https://github.com/AztecProtocol/barretenberg/issues/1381)\nbreaking the soundness of PG recursive verifier which could allow\ncompletely breaking Client IVC. This fixes it.\n\nCloses: https://github.com/AztecProtocol/barretenberg/issues/1381\n\n---------\n\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>\nCo-authored-by: ludamad <domuradical@gmail.com>\nCo-authored-by: ludamad <adam.domurad@gmail.com>",
          "timestamp": "2025-05-02T21:27:18Z",
          "tree_id": "75f8bc1191530b04bd765caa400df6b65eb63b19",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6bf07d407f2d797152d9251c3c1654efd4240102"
        },
        "date": 1746225947206,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18102.08568600001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14356.042738 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2228876035,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 202908952,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20013.39327400001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17021.277135999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55131.856397,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55131858000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4323.258240999621,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3676.7526629999998 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11601.403831000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11601410000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2215.88",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "isennovskiy@gmail.com",
            "name": "Innokentii Sennovskii",
            "username": "Rumata888"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "6bf07d407f2d797152d9251c3c1654efd4240102",
          "message": "fix: Fixing PG recursive verifier FS break (#14004)\n\nThere was a\n[vulnerability](https://github.com/AztecProtocol/barretenberg/issues/1381)\nbreaking the soundness of PG recursive verifier which could allow\ncompletely breaking Client IVC. This fixes it.\n\nCloses: https://github.com/AztecProtocol/barretenberg/issues/1381\n\n---------\n\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>\nCo-authored-by: ludamad <domuradical@gmail.com>\nCo-authored-by: ludamad <adam.domurad@gmail.com>",
          "timestamp": "2025-05-02T21:27:18Z",
          "tree_id": "75f8bc1191530b04bd765caa400df6b65eb63b19",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6bf07d407f2d797152d9251c3c1654efd4240102"
        },
        "date": 1746225961881,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 16749,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 1285,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 54626,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2711,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 15570,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 1312,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 51503,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2859,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 26657,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 4011,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 85477,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 4483,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 15071,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1182,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49263,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2475,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18857,
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
            "value": 61240,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3157,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12942,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1149,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42874,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1807,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21948,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 2850,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 69874,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3726,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14554,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1223,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47548,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2478,
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
          "id": "7b26feb0ff14931540d81feaade10e6cca90ffd8",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"2d830cc52a\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"2d830cc52a\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-05-03T02:30:30Z",
          "tree_id": "005d1d58fe536c8c4368eca72cfa17ef47f09a88",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7b26feb0ff14931540d81feaade10e6cca90ffd8"
        },
        "date": 1746241541864,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 16628,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 1315,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 54522,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2699,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 15485,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 1304,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 50292,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2804,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 26779,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 3897,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 85706,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 4649,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 15254,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1191,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49340,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2454,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18933,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1423,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 61512,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3468,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 13003,
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
            "value": 41622,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2076,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21876,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 3004,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 70274,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3748,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14639,
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
            "value": 48492,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2344,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "id": "02866bd7d78ee998c7a1c11c83768a40888efb26",
          "message": "fix(docs): Update JS tutorials to fix versions (#14053)\n\n- adds versioning to aztec.js tutorials",
          "timestamp": "2025-05-04T02:18:51Z",
          "tree_id": "e05990096767158236c8c36d8ec518f59e3dc932",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/02866bd7d78ee998c7a1c11c83768a40888efb26"
        },
        "date": 1746327136131,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 16702,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 1283,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 54168,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2759,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 15524,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 1267,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 51115,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2764,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 26850,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 3853,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 85410,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 4713,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14988,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1206,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49116,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2277,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18966,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1386,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 60986,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3316,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12928,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1151,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42474,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1924,
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
            "value": 2930,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 70332,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3819,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14498,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1196,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47528,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2490,
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
          "id": "f6a77748ac3d1779f16d5695447f434ea27d10d8",
          "message": "feat!: improving perf insights + avoid simulating on proving (#13928)\n\nIntroduces new timing info in`profileTx`, but in the process got\ndistracted by a few things, so I'm branching this off before adding more\nbenchmarks:\n\n- Adds a contract deployment benchmark to our key flows\n- Avoids resimulating kernels (in brillig) before proving. We're going\nto do witgen anyways! This should improve our performance across the\nboard. Simulation is still recommended, but that's left as a wallet\nresponsibility\n- Allows playground to profile txs taking into account fee payments\nand/or authwits\n\n---------\n\nCo-authored-by: Nicolás Venturo <nicolas.venturo@gmail.com>",
          "timestamp": "2025-05-05T06:56:12Z",
          "tree_id": "1d7996c4d2a2d73f3cf2a8d35dedd2a092be208f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f6a77748ac3d1779f16d5695447f434ea27d10d8"
        },
        "date": 1746430202771,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24414,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 3309,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77656,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 4569,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21510,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2307,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67429,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3148,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14910,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1199,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49690,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2308,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18290,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1417,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58778,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3308,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12737,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1127,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41467,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1917,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21714,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1751,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 70149,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3564,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14762,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1217,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47983,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2213,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13930,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1167,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45846,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2149,
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
          "distinct": false,
          "id": "6728664dc8924d0ddb7cf8312df8be3926395af3",
          "message": "fix: e2e_fees (#14075)\n\nIncorrectly flagged as flake",
          "timestamp": "2025-05-05T08:11:11Z",
          "tree_id": "a22499d12a4e3818222c4075ed4ada749aea44a0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6728664dc8924d0ddb7cf8312df8be3926395af3"
        },
        "date": 1746434595854,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24913,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 3771,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 79461,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 4721,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21483,
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
            "value": 67826,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3034,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 15015,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1214,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48529,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2385,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18528,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1399,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59030,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3346,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12958,
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
            "value": 42376,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2140,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 22055,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 2094,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 70213,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3667,
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
            "value": 1237,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48361,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2418,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13873,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1181,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45283,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2299,
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
          "id": "c4602e1c898504106fa4ebf5d0c96f9a343aaa69",
          "message": "chore: avoid unnecesary async chunks (#14076)\n\nMaster version of:\nhttps://github.com/AztecProtocol/aztec-packages/pull/14074",
          "timestamp": "2025-05-05T08:13:58Z",
          "tree_id": "16d899fcc1b8a11abf2f38a1eb05639ce0d2bcc5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c4602e1c898504106fa4ebf5d0c96f9a343aaa69"
        },
        "date": 1746435173150,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18067.10745999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14289.606154 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2179127707,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 200619638,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20006.57119199991,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17103.867075000002 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55218.242189,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55218243000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4287.784651000038,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3591.787118 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11773.885658000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11773893000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2215.88",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "c4602e1c898504106fa4ebf5d0c96f9a343aaa69",
          "message": "chore: avoid unnecesary async chunks (#14076)\n\nMaster version of:\nhttps://github.com/AztecProtocol/aztec-packages/pull/14074",
          "timestamp": "2025-05-05T08:13:58Z",
          "tree_id": "16d899fcc1b8a11abf2f38a1eb05639ce0d2bcc5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c4602e1c898504106fa4ebf5d0c96f9a343aaa69"
        },
        "date": 1746435186172,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24918,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 4139,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78924,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 4547,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21481,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2321,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 68383,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3052,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14914,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1163,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49293,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2340,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18466,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1440,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58779,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3307,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12717,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1130,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 40997,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1929,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21940,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1774,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 70414,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3658,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14637,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1226,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47801,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2388,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13687,
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
            "value": 45056,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2406,
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
          "distinct": true,
          "id": "7012aebf69ed546c3576eb32bad70c88d9cf8400",
          "message": "fix: Error enriching after noir changes (#14080)\n\nUpdates our error enrichment code after the changes in noir to use a\nlocations tree. Partially based on\nhttps://github.com/AztecProtocol/aztec-packages/pull/14016",
          "timestamp": "2025-05-05T16:25:52Z",
          "tree_id": "c8d99d9e28aa5e4c98da06e4aea8d63735f0c4bd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7012aebf69ed546c3576eb32bad70c88d9cf8400"
        },
        "date": 1746464287795,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24667,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 3458,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78768,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 4456,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21376,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2299,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67702,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3130,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14967,
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
            "value": 48725,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2296,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18181,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1412,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58106,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3213,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12790,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1128,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41879,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1892,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21539,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1778,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 69693,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3589,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14428,
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
            "value": 47278,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2406,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13862,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1170,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44155,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2374,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746467987107,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18053.79448299999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14316.495228 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2178009841,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 194963043,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20190.923188,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16977.379281999998 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55639.917389999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55639919000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4155.495659000053,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3583.4432829999996 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11967.800002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11967803000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2215.88",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
        "date": 1746473341530,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17981.70723999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14310.506281 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2196616327,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 207754196,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20215.604322999978,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17065.529397 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55043.758077000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55043760000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4319.9724989999595,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3697.424781 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11855.746588999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11855751000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2167.88",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
        "date": 1746473354993,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24912,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 3664,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78104,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 4699,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21318,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2334,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67529,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3123,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14972,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1204,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49697,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2347,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18440,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1429,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59844,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3329,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12891,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1128,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41331,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1851,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 22050,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1913,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 70266,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3774,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14713,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1209,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48816,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2418,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13850,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1177,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45885,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2496,
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
          "id": "bb78059a896a4e8332054075e98cff4d00f6920a",
          "message": "fix(bb): solve memory blowup, acir::Opcode 7kb => 386 bytes (#14042)\n\nAdded a script that can be run after acir generations, until\nhttps://github.com/zefchain/serde-reflection/issues/75 has attention\nThe issue is that we have a giant enum over these static arrays. In\nRust, they are `Box<... array ...>`, which would be `std::unique_ptr<...\narray ...>` in C++. We have an issue open to do just this - but\nmeanwhile, the more practical move is to use std::shared_ptr to avoid\nfurther changes.\n\nAlso uses std::move more to reduce time and allocation.",
          "timestamp": "2025-05-05T23:29:12Z",
          "tree_id": "ebd4b6cd572da6e0b7168f962739c9b1ff4cc4ad",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/bb78059a896a4e8332054075e98cff4d00f6920a"
        },
        "date": 1746491480892,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17946.73474399997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14334.413324 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2164936172,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 195756452,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20135.572959,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17069.121175 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55262.259739999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55262262000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4357.637403999888,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3838.231934 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11635.701165999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11635706000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2231.81",
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
          "id": "bb78059a896a4e8332054075e98cff4d00f6920a",
          "message": "fix(bb): solve memory blowup, acir::Opcode 7kb => 386 bytes (#14042)\n\nAdded a script that can be run after acir generations, until\nhttps://github.com/zefchain/serde-reflection/issues/75 has attention\nThe issue is that we have a giant enum over these static arrays. In\nRust, they are `Box<... array ...>`, which would be `std::unique_ptr<...\narray ...>` in C++. We have an issue open to do just this - but\nmeanwhile, the more practical move is to use std::shared_ptr to avoid\nfurther changes.\n\nAlso uses std::move more to reduce time and allocation.",
          "timestamp": "2025-05-05T23:29:12Z",
          "tree_id": "ebd4b6cd572da6e0b7168f962739c9b1ff4cc4ad",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/bb78059a896a4e8332054075e98cff4d00f6920a"
        },
        "date": 1746491494582,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24378,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1897,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78768,
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
            "value": 21383,
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
            "value": 68890,
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
            "value": 14981,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1227,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 50304,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1825,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17945,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1380,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58497,
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
            "value": 12446,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1155,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41693,
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
            "value": 21366,
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
            "value": 70912,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2223,
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
            "value": 1204,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48637,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1818,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13282,
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
            "value": 45130,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1873,
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
          "id": "a0d48a5b515813b9d11d85fad0ef15760b4a028a",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"2483a77bd8\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"2483a77bd8\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-05-06T02:31:49Z",
          "tree_id": "60f660004a9cca06fff737684a46dd370ddd381c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a0d48a5b515813b9d11d85fad0ef15760b4a028a"
        },
        "date": 1746500759676,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24307,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1895,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 79085,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2286,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21204,
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
            "value": 68048,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3143,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14673,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1190,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49449,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1842,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17995,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1417,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58325,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1987,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12357,
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
            "value": 42320,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1795,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21186,
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
            "value": 69835,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2277,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14179,
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
            "value": 48559,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1780,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13520,
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
            "value": 44413,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1768,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746542545616,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18097.002206999605,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14446.335739999999 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2263252198,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 227744383,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19904.603185999804,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16946.425709 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55464.101043,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55464103000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4283.623434999754,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3620.719283 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11778.100483,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11778104000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2231.81",
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
          "id": "30c2030c13c80df5c03f441139dde3387b0931cb",
          "message": "chore: better handling of ultra ops in translator circuit builder (#13990)\n\nThis PR attempts to improve clarity in the circuit builder and reduce\nthe size of existing methods by separating the logic that checks ultra\nops and the logic that populates corresponding wire data using the ultra\nop from other builder logic. This will additionally help code\nshareability in upcoming modifications. I also fixed the\n`TranslatorOpcodeConstraintRelation` as it was accepting some opcodes\nthat are not supported",
          "timestamp": "2025-05-06T13:39:06Z",
          "tree_id": "e42723a846cc88379cccfd442b0bb139ed4108ae",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/30c2030c13c80df5c03f441139dde3387b0931cb"
        },
        "date": 1746542558255,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24524,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1877,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78324,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2330,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21557,
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
            "value": 68378,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3038,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14780,
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
            "value": 50082,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1840,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18252,
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
            "value": 59696,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1922,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12765,
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
            "value": 41645,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1763,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21494,
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
            "value": 70168,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2264,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14530,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1193,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 49233,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1800,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13615,
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
            "value": 45721,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1752,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          }
        ]
      }
    ]
  }
}