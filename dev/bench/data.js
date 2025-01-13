window.BENCHMARK_DATA = {
  "lastUpdate": 1736795833694,
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
          "distinct": true,
          "id": "e8480cbf1ecdee5d7228b08d1c9608308acdd624",
          "message": "feat: move busread and lookup block construction at the top of the trace (#10707)\n\nConstructing the lookup block and lookup table data at the top of the\r\ntrace removes the dependence of active ranges on the dyadic circuit size\r\nwhich was causing problems for the overflow scenario and also reduces\r\nthe number of active rows to be close to the real size (modulo\r\nhttps://github.com/AztecProtocol/barretenberg/issues/1152 which still\r\nneeds investigation).",
          "timestamp": "2024-12-18T11:15:45Z",
          "tree_id": "7b9e38e07add526aab7d999bf58d7a83a4e7430b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e8480cbf1ecdee5d7228b08d1c9608308acdd624"
        },
        "date": 1734523065330,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 21469.483932999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18921.031903 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24431.404593999985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 21786.193354000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4968.941267000019,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4642.270874999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85628.90712,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85628908000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15079.21652,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15079218000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2838666079,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2838666079 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142377178,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142377178 ns\nthreads: 1"
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
          "id": "970ad77966a17fd5c8071a7c3c3a405f83630c5d",
          "message": "fix: toBlock argument in L1 getLogs is inclusive (#10828)\n\nAs @alexghr identified, we got a spurious reorg on a node in the exp1\r\nnetwork. This was caused by the node getting a current\r\n`l1BlockNumber=245`, but then fetching an L2 block mined at 246.\r\n\r\nThis caused the `canPrune` check to fail: \r\n\r\n```\r\nconst canPrune =\r\n      localPendingBlockNumber > provenBlockNumber &&\r\n      (await this.rollup.read.canPruneAtTime([time], { blockNumber: currentL1BlockNumber }));\r\n```\r\n\r\nThe `canPruneAtTime` was evaluated at L1 block number 245, and it\r\ncorrectly returned true, since there had been a reorg shortly before (at\r\n240), and no new L2 block had been mined so the rollup hadn't reset its\r\nstate by then. However, the `localPendingBlockNumber` was incorrectly\r\nincreased due to the block mined at 246, which caused the archiver to\r\nincorrectly reorg it.\r\n\r\nThis PR fixes the L1 event queries so the `toBlock` is inclusive. A\r\nquick test with cast shows that this is the case:\r\n```\r\n$ cast logs -r https://mainnet.infura.io/v3/$INFURA_API_KEY --from-block 0x146eade --to-block 0x146eadf --address 0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48 --json | jq .[].blockNumber | uniq\r\n\"0x146eade\"\r\n\"0x146eadf\"\r\n```\r\n\r\nAnd just for good measure, we also filter the logs returned by the block\r\nrange searched.",
          "timestamp": "2024-12-18T09:11:04-03:00",
          "tree_id": "88fcc9cac8e1e230915fc3ec5831be1d3b43f54b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/970ad77966a17fd5c8071a7c3c3a405f83630c5d"
        },
        "date": 1734525442139,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 21512.632263,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18789.880754 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24456.08347000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 21644.320863 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4951.82334499998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4605.475333 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85072.53844,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85072539000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15053.910278,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15053911000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2831719351,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2831719351 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142050591,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142050591 ns\nthreads: 1"
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
          "id": "8820bd5f3004fedd6c286e2dbf5f8b24fc767fd2",
          "message": "fix: handle calls to non-existent contracts in AVM witgen (#10862)\n\nExceptionally halt & consume all gas on a call to a non-existent\ncontract. Should be able to prove.\n\nHacked this to work for top-level/enqueued-calls by adding a dummy row\n(`op_add`) and then raising an exceptional halt.\n\nResolves https://github.com/AztecProtocol/aztec-packages/issues/10373\nResolves https://github.com/AztecProtocol/aztec-packages/issues/10044\n\nFollow-up work:\n- Add tests for bytecode deserialization failures (sim & witgen)",
          "timestamp": "2024-12-19T06:36:48-05:00",
          "tree_id": "895b9543d9e3a2d453c93791371cd2b084e935b1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8820bd5f3004fedd6c286e2dbf5f8b24fc767fd2"
        },
        "date": 1734609525000,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 21746.67925900002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19073.500444 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24511.337944000017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 21797.343171 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5007.585204999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4645.667925 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84614.78080800001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84614782000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15131.664287000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15131665000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2853639406,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2853639406 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141955268,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141955268 ns\nthreads: 1"
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
          "distinct": true,
          "id": "7a9506c6f400a88cbdbc9fad75d7b2bd35bea2cf",
          "message": "chore(avm): Conditionally enable avm recursion unit tests based on an env variable (#10873)",
          "timestamp": "2024-12-19T12:57:10+01:00",
          "tree_id": "7367ac20097ce413d80f63880e0ea231f9ca6d68",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7a9506c6f400a88cbdbc9fad75d7b2bd35bea2cf"
        },
        "date": 1734610769721,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 21416.303787000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18956.300385 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24393.417599999964,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 21576.290522999996 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4944.460961999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4635.3334970000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83881.326274,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83881397000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15006.525647999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15006526000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2849739376,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2849739376 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 144576089,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 144576089 ns\nthreads: 1"
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
          "id": "ebd6aba915b822711166b4424cc4c81f226ddcfb",
          "message": "feat: add gate count tracking for ivc constraints (#10772)",
          "timestamp": "2024-12-19T17:07:29+04:00",
          "tree_id": "f7976d07836b0f32189891b9f8d041633cf70403",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ebd6aba915b822711166b4424cc4c81f226ddcfb"
        },
        "date": 1734614706266,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20489.601304000018,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17991.324086999997 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24164.213521000023,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 21199.935229000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4435.946793999989,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4157.363215 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 95397.72463900001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 95397725000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16469.350387000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16469351000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3643733636,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3643733636 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 165826917,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 165826917 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "blorktronics@gmail.com",
            "name": "Zachary James Williamson",
            "username": "zac-williamson"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "15475f47bdc2ac02ea5157bdc9d1f5172ff6ed09",
          "message": "feat: added a UnivariateMonomial representation to reduce field ops in protogalaxy+sumcheck (#10401)\n\nSummary:\r\n\r\n`client_ivc_bench.sh` benchmark has been improved by approx 10% (26218ms\r\nvs 29306ms)\r\n\r\nIn both protogalaxy + sumcheck, the basic representation of the edge of\r\nthe boolean hypercube is now a degree-1 monomial instead of a\r\nMAX_RELATION_DEGREE-degree monomial\r\n\r\nThe class UnivariateMonomial can efficiently evaluate low-degree\r\nmonomial relations of up to degree-2. The relations in the `relations`\r\ndirectory have been reworked to perform initial low-degree algebraic\r\ncomputations using UnivariateMonomial, only converting to a full\r\nMonomial object once the UnivariateMonomial would otherwise exceed\r\ndegree-2\r\n\r\nReason why we do all of this:\r\n\r\n1. for MegaFlavor, `extend_edges` was converting every flavour\r\npolynomial into a degree-11 Univariate. This was introducing 9 Fp\r\nadditions * NUM_ALL_ENTITIES per row in the circuit. Given the sparse\r\ntrace structure we are working with, this is a lot of computation that\r\nthis PR makes redundant\r\n2. for each relation, we check if it can be skipped by typically calling\r\n`is_zero` on a selector. The selector poly is in Univariate form\r\n(MegaFlavor = degree-11) which is 11 Fp zero-checks. MegaFlavor has 9\r\nskippable relations which is 99 Fp zero-checks. With the new degree-2\r\nrepresentation this is reduced to only 18 Fp zero-checks\r\n3. The number of raw Fp add and mul operations required to evaluate our\r\nrelations is reduced. For example, in the permutation argument each\r\n`*`/`+` operation in the `accumulate` function was costing us 11 Fp\r\nmuls/adds. It is cheaper to compute low-degree sub-terms in the\r\ncoefficient representation before extend inginto point-evaluation\r\nrepresentation\r\n\r\ne.g. consider (in the protogalaxy case where challenges are degree-1\r\nunivariates) `(w_i + \\beta * S_i + \\gamma)` for `i = 0,1,2,3`. In\r\ncoefficient representation this term can be computed with 8 Fp adds and\r\n3 Fp muls. Extending into a degree-11 point evaluation form costs 18 Fp\r\nadds for a total of 26 Fp adds and 3 Fp muls.\r\n\r\nIn master branch, using Univariate<11> this computation costs us 20 Fp\r\nadds and 10 Fp muls. Assuming an add is 1/3 the cost of a mul, this\r\nmakes the new approach cost 35 Fp add-equivalent operations vs 50 Fp\r\nadd-equivalent\r\n\r\nOverall in the new approach, the number of field operations to compute\r\nthe permutation argument has reduced by 30%",
          "timestamp": "2024-12-19T15:12:09Z",
          "tree_id": "16726762d4bf7492bbfa2f371eae794d8b327586",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/15475f47bdc2ac02ea5157bdc9d1f5172ff6ed09"
        },
        "date": 1734622480904,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19619.226225000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17172.247299 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21711.567222000012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19137.342345 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4174.930159000013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3868.259428 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84176.988422,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84176989000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15217.179274000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15217181000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2781235387,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2781235387 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 132331442,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 132331442 ns\nthreads: 1"
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
          "id": "ef247d4d68ce4aadb4c45b1f75d71a411e7102b6",
          "message": "chore(avm): extra column information in lookups (#10905)\n\nNeeded for vm2. This helps derive a lookup class from the settings.",
          "timestamp": "2024-12-20T12:40:40Z",
          "tree_id": "56999a44a08648832134df54a69c7ecfa7b847e8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ef247d4d68ce4aadb4c45b1f75d71a411e7102b6"
        },
        "date": 1734699417335,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20294.08005800002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17774.308369 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21876.17391399999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19281.479867 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4655.666172999986,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4343.510282 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73152.726453,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73152726000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14069.454980000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14069455000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3250698225,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3250698225 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 145886537,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 145886537 ns\nthreads: 1"
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
          "id": "9ed43bce2545f908d6351c6d330470b19510d216",
          "message": "chore(master): Release 0.68.0 (#10834)\n\nThis release is too large to preview in the pull request body. View the\nfull release notes here:\nhttps://github.com/AztecProtocol/aztec-packages/blob/release-please--branches--master--release-notes/release-notes.md",
          "timestamp": "2024-12-20T18:20:26Z",
          "tree_id": "b75f467a03f4f7d7156fde301c3cb4f537ff1159",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9ed43bce2545f908d6351c6d330470b19510d216"
        },
        "date": 1734719799818,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20322.919189999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17695.727963999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21812.926538,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19041.610996 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4630.180110999959,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4317.738614999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 81610.981691,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 81610982000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13894.379013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13894378000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3352309391,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3352309391 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142453198,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142453198 ns\nthreads: 1"
          }
        ]
      },
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
          "id": "bf5e294dd31ed860d5b4ce6bf06f7ae4d5f3052a",
          "message": "chore(master): Release 0.68.0",
          "timestamp": "2024-12-20T18:20:30Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/10834/commits/bf5e294dd31ed860d5b4ce6bf06f7ae4d5f3052a"
        },
        "date": 1734719805369,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20448.393573000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17879.481030000003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21785.989263999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19094.770102 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4627.763732999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4282.267201999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73104.782897,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73104783000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13925.917256,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13925918000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2869513808,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2869513808 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141927201,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141927201 ns\nthreads: 1"
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
          "id": "5da4d1b661cb27b81c657adacf928a74f98c264c",
          "message": "chore: reorganise translator proving key construction (#10853)\n\nTranslator ProverPolynomials were constructed in three different files: \r\n* `permutation_lib.hpp` which was part of the honk target\r\n* the witness was constructed in the `TranslatorProver` class\r\n* some polynomials were constructed in `TranslatorFlavor`\r\n\r\nThis PR introduces a `TranslatorProvingKey` aimed to unify the logic in\r\na manner similar to `DeciderProvingKey`, in an attempt to make\r\nnavigating state less confusing.",
          "timestamp": "2024-12-23T15:58:07+01:00",
          "tree_id": "acb3e4a424141ede7a93de01026623d740b2b2ac",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5da4d1b661cb27b81c657adacf928a74f98c264c"
        },
        "date": 1734967451673,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20232.947851000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17634.279267 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21819.305328000042,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19323.144963 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4625.779651000016,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4276.178236999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72986.298089,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72986298000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13980.891083999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13980892000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2850525774,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2850525774 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 147333302,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 147333302 ns\nthreads: 1"
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
          "id": "d340f0b0c2c97b59d2a8830bdae452d85945322c",
          "message": "feat: add limit to unique contract call (#10640)\n\nResolves https://github.com/AztecProtocol/aztec-packages/issues/10369\n\nNote from @dbanks12:\nOnce the limit has been reached for contract calls to unique class IDs,\nyou can still call repeat contract addresses or even other contract\naddresses that reuse an already checked class ID.\n\nI had to change the call-ptr/space-id to just use a counter instead of\nclk because space-id is uint8 and we were getting collisions.\n\nFollow-up work:\n- constrain that user-called address can be derived from the hinted\nclass ID & instance\n\n---------\n\nCo-authored-by: dbanks12 <david@aztecprotocol.com>",
          "timestamp": "2024-12-23T11:31:43-05:00",
          "tree_id": "68a082cb55164e4b8f30b258c0cf7e0827b1dea5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d340f0b0c2c97b59d2a8830bdae452d85945322c"
        },
        "date": 1734973073087,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20471.22738400003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17957.367361 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21974.129255000036,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19420.415213 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4805.8454459999775,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4480.75968 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 82513.43422000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 82513434000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14027.516520000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14027517000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3056525550,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3056525550 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 144956508,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 144956508 ns\nthreads: 1"
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
          "distinct": true,
          "id": "ab3f31858b09cb6c8afcc3d2f8f361814cbe531c",
          "message": "chore(avm): Check that slice read/write are not out of memory range (#10879)\n\nResolves #7385",
          "timestamp": "2024-12-23T12:55:55-05:00",
          "tree_id": "a04e96a75229aaf1f1619b370f67eb579feaefaf",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ab3f31858b09cb6c8afcc3d2f8f361814cbe531c"
        },
        "date": 1734977631713,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20623.245949999953,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18061.201221 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 22011.64535800001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19314.090194999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4753.147948999953,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4413.159777000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 82094.17110699999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 82094172000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14132.730854000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14132732000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3517619210,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3517619210 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 167597621,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 167597621 ns\nthreads: 1"
          }
        ]
      },
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
          "id": "febb96c06d3ca51a70cf116d05fa21ad23d733d1",
          "message": "chore(master): Release 0.68.1",
          "timestamp": "2024-12-23T19:14:35Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/10918/commits/febb96c06d3ca51a70cf116d05fa21ad23d733d1"
        },
        "date": 1734981831023,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20349.93410200002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17890.489276 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21881.26345699999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19420.72105 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4623.300760000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4314.227238000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73099.897263,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73099898000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13932.895406,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13932897000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2916163511,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2916163511 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 165929001,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 165929001 ns\nthreads: 1"
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
          "id": "82bc146989f1375bb36b7d2ab47e3068af513f71",
          "message": "feat: Use UltraRollupHonk in rollup (#10342)\n\nUses UltraRollupFlavor and UltraRecursiveRollupFlavor in the rollup.\r\n\r\nModifies UltraRecursiveVerifier tests to also test rollup flavors.\r\n\r\nAdds new test program, `verify_rollup_honk_proof`, and new flows for\r\ntest program.",
          "timestamp": "2024-12-23T21:44:01-05:00",
          "tree_id": "2e914ee49452cfa42859749031266af8861790f3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/82bc146989f1375bb36b7d2ab47e3068af513f71"
        },
        "date": 1735009269479,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20272.17651000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17720.271271999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21821.03502000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19092.446210000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4614.9903919999815,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4236.160359 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73296.235023,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73296235000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13932.224051000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13932225000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2864960911,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2864960911 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142324936,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142324936 ns\nthreads: 1"
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
          "id": "2274402ef1b67d8f1a88a922d00521a48cf38c08",
          "message": "chore(master): Release 0.68.2 (#10948)\n\n:robot: I have created a release *beep* *boop*\r\n---\r\n\r\n\r\n<details><summary>aztec-package: 0.68.2</summary>\r\n\r\n##\r\n[0.68.2](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.68.1...aztec-package-v0.68.2)\r\n(2024-12-23)\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **aztec-package:** Synchronize aztec-packages versions\r\n</details>\r\n\r\n<details><summary>barretenberg.js: 0.68.2</summary>\r\n\r\n##\r\n[0.68.2](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.68.1...barretenberg.js-v0.68.2)\r\n(2024-12-23)\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **barretenberg.js:** Synchronize aztec-packages versions\r\n</details>\r\n\r\n<details><summary>aztec-packages: 0.68.2</summary>\r\n\r\n##\r\n[0.68.2](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.68.1...aztec-packages-v0.68.2)\r\n(2024-12-23)\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Fix proverEnabled flag in cli-wallet\r\n([#10945](https://github.com/AztecProtocol/aztec-packages/issues/10945))\r\n([c484e50](https://github.com/AztecProtocol/aztec-packages/commit/c484e50ad990ae50e99a5badc4cec60e679d68e8))\r\n</details>\r\n\r\n<details><summary>barretenberg: 0.68.2</summary>\r\n\r\n##\r\n[0.68.2](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.68.1...barretenberg-v0.68.2)\r\n(2024-12-23)\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **barretenberg:** Synchronize aztec-packages versions\r\n</details>\r\n\r\n---\r\nThis PR was generated with [Release\r\nPlease](https://github.com/googleapis/release-please). See\r\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2024-12-24T11:39:33+05:30",
          "tree_id": "d42c72b648235bbde664014065e3bdd8a3c89440",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2274402ef1b67d8f1a88a922d00521a48cf38c08"
        },
        "date": 1735021559356,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20018.349253999986,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17621.63941 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21796.022749999964,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18993.331961 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4624.46975200001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4296.561926 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72979.099704,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72979100000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13988.284001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13988284000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2881450982,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2881450982 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142409439,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142409439 ns\nthreads: 1"
          }
        ]
      },
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
          "id": "0836fabe6bff272133b2befe2d713f194c5df694",
          "message": "chore(master): Release 0.68.2",
          "timestamp": "2024-12-24T06:09:38Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/10948/commits/0836fabe6bff272133b2befe2d713f194c5df694"
        },
        "date": 1735021634984,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20205.64733500001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17739.005098999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21751.091279999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19197.790051999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4644.332130999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4290.627646 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 81467.184956,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 81467186000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13952.067319999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13952067000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2880935505,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2880935505 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141464050,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141464050 ns\nthreads: 1"
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
          "id": "f6fef05119af7714d60f00c52455e52bdfa98288",
          "message": "chore: clean up translator circuit builder function definitions  (#10944)\n\nSome of the core functions in `TranslatorCircuitBuilder` were not\r\nactually defined as part of the class. This PR addresses it, which\r\nremoves the need to resolve the scope of member variables in the class,\r\nwhen used in those functions, and constified / staticfied function\r\nsignatures where appropriate",
          "timestamp": "2024-12-24T16:26:03+01:00",
          "tree_id": "77291f32991c1387bfee815d54b0b9cb33c33f73",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f6fef05119af7714d60f00c52455e52bdfa98288"
        },
        "date": 1735055516004,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20104.694028999973,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17574.052976 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21826.818340999976,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19063.207024999996 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4633.245838000022,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4316.263722000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72941.80755700001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72941809000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13911.937908,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13911938000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2884668919,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2884668919 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 146851888,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 146851888 ns\nthreads: 1"
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
          "id": "158afc4cd34a9fc9cb41bcb083b5197eae1ce442",
          "message": "chore: fix mac build (#10963)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2024-12-24T14:51:00-05:00",
          "tree_id": "49d4f6a96d23bd029343329ad9ffce272947f029",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/158afc4cd34a9fc9cb41bcb083b5197eae1ce442"
        },
        "date": 1735070915227,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20346.310748000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17786.132812999997 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21758.651991999955,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19133.20074 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4606.017660999982,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4288.9733080000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72841.53083700001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72841531000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13950.229712000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13950231000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2855202326,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2855202326 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 144694268,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 144694268 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "karl.lye@gmail.com",
            "name": "Charlie Lye",
            "username": "charlielye"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "49dacc3378a339f8cc36971b630c52952249f60c",
          "message": "chore: Cl/ci3.2 (#10919)\n\nFurther iteration towards full CI3.\r\nTLDR: Working towards ~10m repo test time.\r\n\r\n* Begin to separate out \"building of tests\" (mainly thinking of C++ and\r\nRust). We don't want to do this on a fast bootstrap, but we do want to\r\ndo it if we're going to run the tests. And moving towards the new\r\ntesting model we need to separate building and running of tests.\r\n* Introduce `test-cmds` cmd on bootstrap scripts. Returns a list of\r\ncommands, that if run from repo root, execute individual (usually)\r\ntests.\r\n* Note this also introduces the standard of `./scripts/run_test.sh`\r\nbeing a script that given some succinct arguments, can run a single\r\ntest.\r\n* Introduce `test-all` (eventually to become just `test`) in root\r\nbootstrap.sh. No args runs all tests, or you can give it a list of\r\nfolders to projects with their own bootstrap scripts and it'll run their\r\ntests. Runs in 10m20s. Currently skipping some things (see TODO below).\r\nReports slow tests after run.\r\n* Note this also runs our TS project tests *directly as javascript*.\r\ni.e. it's assumed the tests have all been compiled to the dest folder\r\nand have whatever they need to operate. Hitting yarn + transpiler is\r\njust gruesome use of resources.\r\n* Improve cache script to not deal with env vars, but just args. If the\r\nargs is a file, its treated as a rebuild patterns file, otherwise\r\ntreated as a pattern itself.\r\n* Remove `TEST=0/1` flag. Unnecessary. Normal bootstraps don't run\r\ntests, and If i request to run tests I want them to run. So the \"skip\r\ntests if cache flag exists\" only needs to be applied if `CI=1`.\r\n* Get's rid of all hardcoded srs paths in favour of making function call\r\nto get the path. Will check environment variables first, and fallback on\r\nhardcoded path (now in one place). I ultimately didn't need this like I\r\nthought I would, but it's the right move anyway, and will make the\r\nswitch to the flat crs easier.\r\n* Bit of refactoring to remove \"right drift\" of cache blocks. i.e.\r\nreturn if nothing to do instead of enclosing in an if statement.\r\n* bb.js uses @swc/jest like yarn-projects does.\r\n* Delete `bootstrap` folder. Is was there to help test the bootstrap\r\nscript in CI, but now we use the bootstrap script in CI.\r\n* Add build cache to `boxes`.\r\n* Enable extended globs in CI3 scripts.\r\n* Revert back to default jest reporter, unless running all tests from\r\nroot, then it uses summary reporter.\r\n\r\nTODO:\r\n- [ ] kv-store tests\r\n- [x] TXE for contracts/aztec.nr tests\r\n- [x] noir js packages tests\r\n- [ ] Skipping tests matching `test_caches_open|requests` in noir tests.\r\n- [x] Standardise how tests are skipped so we can see in one place.\r\n\r\n---------\r\n\r\nCo-authored-by: ludamad <adam.domurad@gmail.com>",
          "timestamp": "2025-01-02T12:37:03Z",
          "tree_id": "7d7c340709bc212fa5fa493dc1586a4ddb5c1eb7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/49dacc3378a339f8cc36971b630c52952249f60c"
        },
        "date": 1735822393862,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20261.802672999976,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17801.997142 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21823.828717000026,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19275.886926 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4613.451245999982,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4301.50535 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72823.09977500001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72823100000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13925.252640000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13925253000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2869725092,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2869725092 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142542608,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142542608 ns\nthreads: 1"
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
          "id": "2044c58387b5687658f190cf1b4a078a036eabc0",
          "message": "chore: redo typo PR by Anon-im (#11009)\n\nThanks Anon-im for\nhttps://github.com/AztecProtocol/aztec-packages/pull/10955. Our policy\nis to redo typo changes to dissuade metric farming. This is an automated\nscript.",
          "timestamp": "2025-01-02T15:08:02Z",
          "tree_id": "12d5f6b9ca82ea4cc91f7b4c6dcbbd0f7a09d547",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2044c58387b5687658f190cf1b4a078a036eabc0"
        },
        "date": 1735831416875,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20514.750378,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18044.736857 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 22024.17950700004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19090.315262999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4681.815486000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4321.173408999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73860.84801599999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73860849000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14015.076969000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14015077000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2883417471,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2883417471 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141694091,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141694091 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "codygunton@gmail.com",
            "name": "Cody Gunton",
            "username": "codygunton"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "fd5f611aca60c9c906a6440fdb5683794a183d53",
          "message": "feat: Encapsulated UltraHonk Vanilla IVC (#10900)\n\nThis adds a class that does IVC proving via recursion for the UltraHonk\r\nproof system.",
          "timestamp": "2025-01-02T10:11:02-05:00",
          "tree_id": "447a8f6d995a8734379e1a0aebdd3fd538340894",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fd5f611aca60c9c906a6440fdb5683794a183d53"
        },
        "date": 1735831909812,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20620.885541999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18121.592355 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24099.804028999984,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19382.768035999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4675.295517999984,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4317.527015 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 80794.10385099999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 80794105000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13948.856737,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13948858000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3427319387,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3427319387 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 168614617,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 168614617 ns\nthreads: 1"
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
          "id": "0c6a4bee82c62a522f69756f0d233ec637cd1a7a",
          "message": "chore: redo typo PR by petryshkaCODE (#10993)\n\nThanks petryshkaCODE for\nhttps://github.com/AztecProtocol/aztec-packages/pull/10982. Our policy\nis to redo typo changes to dissuade metric farming. This is an automated\nscript.",
          "timestamp": "2025-01-02T15:38:56Z",
          "tree_id": "0f4a236590bf14aeafdc6fa26dcd5d0831f1d846",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0c6a4bee82c62a522f69756f0d233ec637cd1a7a"
        },
        "date": 1735833763118,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20306.493022000013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17804.506748 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21891.938364999987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19106.475278 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4667.638124999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4338.460036999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72991.96774299999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72991968000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13953.806374,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13953807000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2893676788,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2893676788 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142504165,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142504165 ns\nthreads: 1"
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
          "id": "37095ceba560ad66516467387d186b5afd19a6e0",
          "message": "feat: Use full IPA recursive verifier in root rollup (#10962)\n\nModifies the root rollup circuit to use different recursion proof type,\r\nROOT_ROLLUP_HONK and processing of honk_recursion_constraints, so the\r\nbackend knows to run the full IPA recursive verifier.\r\n\r\nResolves https://github.com/AztecProtocol/barretenberg/issues/1183.",
          "timestamp": "2025-01-02T21:45:58Z",
          "tree_id": "fcf966e3b8c5d404c4ec30b396ed70c37832b480",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/37095ceba560ad66516467387d186b5afd19a6e0"
        },
        "date": 1735855292530,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20245.989401999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17751.176918999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21845.095571,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19073.680909 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4635.720676000034,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4339.428815 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73467.872584,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73467873000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13970.039669,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13970039000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2980474638,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2980474638 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141687442,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141687442 ns\nthreads: 1"
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
          "id": "018f11e39266423376b3a56afbc8aaf54b4de31d",
          "message": "chore: redo typo PR by Hack666r (#10992)\n\nThanks Hack666r for\nhttps://github.com/AztecProtocol/aztec-packages/pull/10983. Our policy\nis to redo typo changes to dissuade metric farming. This is an automated\nscript.",
          "timestamp": "2025-01-02T22:09:23Z",
          "tree_id": "0d75dffbb466f62941e3da23fe66e0185876ec0d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/018f11e39266423376b3a56afbc8aaf54b4de31d"
        },
        "date": 1735857180082,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20224.675502999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17803.901766000003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21846.583254999983,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19097.173211 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4612.137423000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4300.750187 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73471.448687,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73471449000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13943.290162999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13943289000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2862021966,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2862021966 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141345356,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141345356 ns\nthreads: 1"
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
          "id": "faca458adda3139e92dcb2709f2c087c85842dd8",
          "message": "chore: redo typo PR by MonkeyKing44 (#10996)\n\nThanks MonkeyKing44 for\r\nhttps://github.com/AztecProtocol/aztec-packages/pull/10985. Our policy\r\nis to redo typo changes to dissuade metric farming. This is an automated\r\nscript.\r\n\r\n---------\r\n\r\nCo-authored-by: Maddiaa <47148561+Maddiaa0@users.noreply.github.com>\r\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>\r\nCo-authored-by: Tom French <tom@tomfren.ch>",
          "timestamp": "2025-01-02T22:09:28Z",
          "tree_id": "a3071b627c68a1f512fab632baffb05730f4b0e1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/faca458adda3139e92dcb2709f2c087c85842dd8"
        },
        "date": 1735857183298,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20238.16852599998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17806.038097 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21832.961119000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19078.769716 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4629.983260000017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4311.801830000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73161.135687,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73161136000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13985.842454000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13985843000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2890763261,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2890763261 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 148888180,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 148888180 ns\nthreads: 1"
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
          "id": "2d3805a3b682b27bf6275c547b4b3d68d214eebe",
          "message": "feat: Sync from noir (#10922)\n\nAutomated pull of development from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nchore: add `rollup_root` and `rollup_block_merge` to tracked protocol\ncircuits (https://github.com/noir-lang/noir/pull/6903)\nfix: consistent file_id across installation paths\n(https://github.com/noir-lang/noir/pull/6912)\nfix: bigint builtins are foreigns\n(https://github.com/noir-lang/noir/pull/6892)\nfix: remove unnecessary cast in bit-shift\n(https://github.com/noir-lang/noir/pull/6890)\nchore: Release Noir(1.0.0-beta.1)\n(https://github.com/noir-lang/noir/pull/6622)\nchore: Add `Instruction::Noop`\n(https://github.com/noir-lang/noir/pull/6899)\nEND_COMMIT_OVERRIDE\n\n---------\n\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2025-01-02T22:19:38Z",
          "tree_id": "f959518d63905f05b879372ef583417ae33ee7b4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2d3805a3b682b27bf6275c547b4b3d68d214eebe"
        },
        "date": 1735857750701,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20568.767926000022,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18035.928342000003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21991.315463000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19276.388183000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4671.218221000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4317.6563129999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 74022.71658800001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 74022717000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13998.589694000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13998590000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2890858706,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2890858706 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 143202427,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 143202427 ns\nthreads: 1"
          }
        ]
      },
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
          "id": "156634d992cadbfbdc7ac964ae122b939f8a3b59",
          "message": "chore(master): Release 0.69.0",
          "timestamp": "2025-01-03T11:16:15Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/10956/commits/156634d992cadbfbdc7ac964ae122b939f8a3b59"
        },
        "date": 1735903519381,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20898.40717599998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18431.508804 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 22328.448932000014,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19512.675563 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4704.935141000022,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4315.106790000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73668.676343,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73668677000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14196.835392,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14196836000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2991132938,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2991132938 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142573096,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142573096 ns\nthreads: 1"
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
          "id": "036496ce7496132b7376c9a6708a9a6ed460771d",
          "message": "fix: add bytecode instances in reverse (#11064)\n\nSince we cache hints from earlier instances, when receiving hints for\ninstances we keep the earliest hints\n\nCo-authored-by: David Banks <47112877+dbanks12@users.noreply.github.com>",
          "timestamp": "2025-01-06T16:47:07Z",
          "tree_id": "cd86891d3d75968515a823602c999dd851ecb5b5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/036496ce7496132b7376c9a6708a9a6ed460771d"
        },
        "date": 1736182994587,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20233.990393,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17800.597287999997 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21802.06259099998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19189.808848999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4602.1164030000255,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4330.8603760000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72813.23902600001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72813239000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13897.274596000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13897274000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2905436109,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2905436109 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142471684,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142471684 ns\nthreads: 1"
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
          "id": "800c83475c2b23ac6cf501c998f7c57b3803ad8f",
          "message": "chore: clean up proof lengths and IPA (#11020)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1184.\r\nCloses https://github.com/AztecProtocol/barretenberg/issues/1168.\r\n\r\nCleans up some ugliness by deduplication and refactoring. Also adds new\r\nUltraRollupHonk tests and a new test for checking proof lengths.",
          "timestamp": "2025-01-06T17:57:15Z",
          "tree_id": "2b87b8a5a45e64471a9de9f547e1feff5f9b59be",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/800c83475c2b23ac6cf501c998f7c57b3803ad8f"
        },
        "date": 1736187226769,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20153.86183999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17671.438688 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21766.65838400004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19315.740832000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4603.296634000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4306.661016 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72754.874095,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72754875000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13977.354899999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13977356000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2868605930,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2868605930 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141858000,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141858000 ns\nthreads: 1"
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
          "id": "8829f2421238945f042338bac0c9e7342517248b",
          "message": "chore(avm): more column information in permutations (#11070)\n\nNeeded for avm2.",
          "timestamp": "2025-01-06T18:53:41Z",
          "tree_id": "047c6def56d1c591d3119c3077af3a927a925042",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8829f2421238945f042338bac0c9e7342517248b"
        },
        "date": 1736190632742,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20378.588485000022,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17867.288208 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21883.914918000017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19310.873033 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4636.138843999959,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4247.608365 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72982.11258399999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72982114000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13911.442454999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13911443000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2871577157,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2871577157 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 145055566,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 145055566 ns\nthreads: 1"
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
          "distinct": true,
          "id": "a5097a994e7ecc0be2b6c7d7b320bd7bad5a27a0",
          "message": "chore(avm): Handle specific MSM errors (#11068)\n\nResolves #10854",
          "timestamp": "2025-01-06T20:38:03Z",
          "tree_id": "7247289a554be3e4ed63f18e538dd7fc90ff5401",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a5097a994e7ecc0be2b6c7d7b320bd7bad5a27a0"
        },
        "date": 1736197371234,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20363.76701100002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17767.931673 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21858.954770999957,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19229.817922 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4632.139879000022,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4317.807648999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72888.76763399999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72888768000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13920.162860999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13920163000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2874988943,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2874988943 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142345825,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142345825 ns\nthreads: 1"
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
          "id": "da5e95ffab1694bad22817edd9abdf8e48c992ca",
          "message": "fix: Update requests per call should be less than per tx (#11072)\n\n`MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX` is 63, but\r\n`MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL` was set to 64. This PR\r\nupdates the `PER_CALL` constant to 63.\r\n\r\nUnrelated updates to other constants are probably due to\r\n`remake-constants` not having been run after updating other constants.",
          "timestamp": "2025-01-06T19:05:14-03:00",
          "tree_id": "55f97d783cfcd1966b118f9eda59b0c4d59c757f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/da5e95ffab1694bad22817edd9abdf8e48c992ca"
        },
        "date": 1736202529736,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20165.038914000037,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17636.651336 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21856.21075300003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19283.547567999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4634.679065,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4318.763916 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73227.457503,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73227459000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13938.672118,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13938673000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2890977578,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2890977578 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 154266954,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 154266954 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "blorktronics@gmail.com",
            "name": "Zachary James Williamson",
            "username": "zac-williamson"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "7da7f2bb6c26a7c55a5869d21c3a5f546880a001",
          "message": "feat: improve witness generation for cycle_group::batch_mul (#9563)\n\nProblem:\r\n\r\n`cycle_group` has a heavy witness generation cost. Existing code\r\nperforms multiple modular inversions for every cycle_group group\r\noperation in `batch_mul`\r\n\r\nThis was leading to 40% of the Prover time for `cycle_group` operations\r\nbeing raw witness generation.\r\n\r\nBatch inversion techniques are now employed to remove this cost.",
          "timestamp": "2025-01-06T17:08:25-05:00",
          "tree_id": "5221d562f6453310d60bab2d4df959480a161cb1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7da7f2bb6c26a7c55a5869d21c3a5f546880a001"
        },
        "date": 1736202763823,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19452.477765000025,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17035.208253999997 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21234.543427999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18605.154755999996 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4621.017558000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4249.78584 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 80358.20862199999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 80358209000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13986.053909,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13986054000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3007016102,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3007016102 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141695438,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141695438 ns\nthreads: 1"
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
          "id": "9968849f1e3680ad26edb174d81693f0ced0edd4",
          "message": "chore: unify honk verifier contracts (#11067)\n\nIntroduce a BaseHonkVerifier abstract contract that can be inherited by\r\nthe test verifier contracts, in a pattern similar to the Plonk verifier\r\ncontract.",
          "timestamp": "2025-01-07T11:08:39Z",
          "tree_id": "4f58abd34c72b739e5e7b60040d0fe8b383cc62d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9968849f1e3680ad26edb174d81693f0ced0edd4"
        },
        "date": 1736249115766,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19497.574117,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17018.690476000003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21441.40179499999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18906.637044 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4615.411822999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4333.8557980000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 71364.75483,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 71364755000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13981.063399,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13981065000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2888447179,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2888447179 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 150275139,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 150275139 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "105737703+iakovenkos@users.noreply.github.com",
            "name": "iakovenkos",
            "username": "iakovenkos"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "fc48dcca537fa790ed6866ad4e184cb89c2617a2",
          "message": "feat: fix commitments and openings of masking polynomials used in zk sumcheck  (#10773)\n\nWe have updated the approach for committing to Libra masking\r\npolynomials. Instead of committing to them and opening them separately,\r\nwe now utilize the [inner products using KZG with ZK and a linear-time\r\nverifier](https://hackmd.io/xYHn1qqvQjey1yJutcuXdg?both#inner-products-using-KZG-with-zk-and-linear-time-verifier)\r\nprotocol, referred to as **SmallSubgroupIPA**.\r\n\r\n### Key Changes in this PR\r\n-  Addressed ZK issues of the previous approach.\r\n- Reduced the number of scalar multiplications required in our ZK\r\nverifiers over BN254.\r\n-  Finalized the necessary logic for UltraZK.\r\n\r\n### Remark\r\nHowever, the non-native arithmetic required by `ECCVMRecursiveVerifier`\r\nbecomes prohibitively expensive if we continue sending the coefficients\r\nof `SumcheckUnivariates`. To address this, we have implemented a\r\nGrumpkin-based version of **SmallSubgroupIPA**, which assumes sending\r\ncommitments to the `SumcheckRound` univariates. This will be done in a\r\nfollow-up update.",
          "timestamp": "2025-01-07T13:39:20+01:00",
          "tree_id": "e24381f5c2522df6b0354a4f35d8a8c79407fe18",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fc48dcca537fa790ed6866ad4e184cb89c2617a2"
        },
        "date": 1736254513769,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19629.297726999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17086.599381 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21314.671893999985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18662.310964 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4651.158126999973,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4254.621628 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72078.668879,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72078669000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13991.375813999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13991376000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2854677686,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2854677686 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 146004416,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 146004416 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "84741533+jewelofchaos9@users.noreply.github.com",
            "name": "defkit",
            "username": "jewelofchaos9"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "1cb7cd78d089fd1e2706d9d5993b6115bcdd6a84",
          "message": "feat: Acir formal proofs (#10973)\n\nThe ACIR formal verification. Combines a test generator in the Noir\r\nrepository with a formal verifier in Barretenberg to mathematically\r\nprove the correctness of ACIR instructions using SMT solving. Verifies\r\nrange of operations including 127-bit arithmetic (addition, subtraction,\r\nmultiplication), 126-bit division, bitwise operations (though currently\r\nlimited to 32-bit for AND/OR/XOR), shift operations, field operations\r\n(ADD, MUL, DIV), and comparison operations",
          "timestamp": "2025-01-07T13:02:00Z",
          "tree_id": "69853ce22187e324099c50b06b7998655253f14e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1cb7cd78d089fd1e2706d9d5993b6115bcdd6a84"
        },
        "date": 1736256421112,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19654.74621499999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17119.365716 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21345.15435100002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18545.349747 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4621.581203999966,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4209.548783000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 71484.080483,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 71484081000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13909.907984000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13909908000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2907780000,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2907780000 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 144538888,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 144538888 ns\nthreads: 1"
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
          "id": "48286c671a61dbe18e5f8e0c44e71ab6c3fd109a",
          "message": "feat: derive transcript structure between non-zk and zk flavors and between Ultra and UltraKeccak (#11086)\n\nThe Transcript Classes were duplicated between base and derived flavors\r\nwhich resulted at times in inconsistencies. This PR addresses the issue:\r\n* ZK flavors' Transcript is now a derived class of the corresponding\r\nnon-ZK Transcript class\r\n* `UltraFlavor` Transcript is now templated so in UltraKeccak we can\r\njust instantiate it with different parameters corresponding to Keccak\r\nrather than duplicate it.\r\n * the transcript tests are run for all flavor variations.",
          "timestamp": "2025-01-07T15:34:25Z",
          "tree_id": "d391f1021ecc959fd74dc082e8b5ecf214b80f5a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/48286c671a61dbe18e5f8e0c44e71ab6c3fd109a"
        },
        "date": 1736265565440,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19626.07817200001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17136.909223 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21383.976447999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18807.720404 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4604.717794999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4331.753499 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72311.288592,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72311289000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14029.206929,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14029207000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2845686908,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2845686908 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141417451,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141417451 ns\nthreads: 1"
          }
        ]
      },
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
          "id": "c1f244c07c642a7cca81a97e4bf7b6e81fbdd346",
          "message": "chore(master): Release 0.69.1",
          "timestamp": "2025-01-08T14:05:53Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/11028/commits/c1f244c07c642a7cca81a97e4bf7b6e81fbdd346"
        },
        "date": 1736345724350,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18830.88268400002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16404.830672 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21144.691059999957,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18560.566394999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4145.21271000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3865.9703339999996 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 74067.02149200001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 74067022000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15195.970955999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15195970000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2798613413,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2798613413 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133968091,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133968091 ns\nthreads: 1"
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
          "id": "b8ef30e2a147b5318b70ff2146186dfbae70af42",
          "message": "chore: redo typo PR by longxiangqiao (#11109)\n\nThanks longxiangqiao for\nhttps://github.com/AztecProtocol/aztec-packages/pull/11108. Our policy\nis to redo typo changes to dissuade metric farming. This is an automated\nscript.",
          "timestamp": "2025-01-08T18:26:47Z",
          "tree_id": "b4bd16010c74eafcb1f37a95d23ffa33ff5496bc",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b8ef30e2a147b5318b70ff2146186dfbae70af42"
        },
        "date": 1736361781827,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19526.87434699999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17100.775563000003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21344.412034999947,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18796.992326000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4631.039611000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4267.490723 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 71776.31402,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 71776314000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13913.263356,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13913264000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2860133484,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2860133484 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142133784,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142133784 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "karl.lye@gmail.com",
            "name": "Charlie Lye",
            "username": "charlielye"
          },
          "committer": {
            "email": "karl.lye@gmail.com",
            "name": "Charlie Lye",
            "username": "charlielye"
          },
          "distinct": true,
          "id": "137ade8a50686d8dd14717895f9a1aa72a073e52",
          "message": "memsuspend on acir_tests. don't overwrite noir-repo stuff.",
          "timestamp": "2025-01-08T21:15:44Z",
          "tree_id": "3a31688a87cecec9377bf5261af38d8863a8e8d4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/137ade8a50686d8dd14717895f9a1aa72a073e52"
        },
        "date": 1736372141531,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20367.440875,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17443.615298 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21842.665305000024,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19053.896231000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4730.941499999972,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4381.511879 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73048.134507,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73048135000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14147.067585,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14147068000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3090299386,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3090299386 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142052111,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142052111 ns\nthreads: 1"
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
          "id": "de9960345da17e97464d2c36c35e3eada4fa3680",
          "message": "feat: permutation argument optimizations  (#10960)\n\nA handful of optimizations for the large ambient trace setting, mostly\nto do with the grand product argument. Total savings is about 1s on the\n\"17 in 20\" benchmark.\n\n- Only perform computation for the grand product on active rows of the\ntrace. This means (1) only setting the values of sigma/id on the active\nrows (they remain zero elsewhere since those values don't contribute to\nthe grand product anyway). And (2) only compute the grand product at\nactive rows then populate the constant regions as a final step. These\nare both facilitated by constructing a vector `active_row_idxs` which\nexplicitly contains the indices of the active rows. This makes it easier\nto multithread and is much more efficient than looping over the entire\ndomain and using something like `check_is_active()` which itself has low\noverhead but results in huge disparities in the distribution of actual\nwork across threads.\n- Replace a default initialized `std::vector` in PG with a `Polynomial`\nsimply to take advantage of the optimized constructor\n\nBranch \"17 in 20\" benchmark\n\n`ClientIVCBench/Full/6      20075 ms        17763 ms`\n\nMaster \"17 in 20\" benchmark\n\n`ClientIVCBench/Full/6      21054 ms        18395 ms`\n\nThe conventional benchmark (\"19 in 19\") shows a very minor improvement,\nas expected:\n\nBranch: \n\n`ClientIVCBench/Full/6      22231 ms        19857 ms`\n\nMaster:\n\n`ClientIVCBench/Full/6      22505 ms        19536 ms`",
          "timestamp": "2025-01-09T10:33:11-07:00",
          "tree_id": "73828bc83a35e049de401d8b3346b10c8b2ba7b5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/de9960345da17e97464d2c36c35e3eada4fa3680"
        },
        "date": 1736445435828,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19884.75347799999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17097.27884 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21838.192907999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18876.969049 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4740.065844000014,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4328.781017000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72406.167237,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72406168000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14272.296748000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14272298000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3231217012,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3231217012 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141715859,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141715859 ns\nthreads: 1"
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
          "id": "535a14c8c59399ce7579c69f6aec862f71981699",
          "message": "chore(avm): improve column stats (#11135)\n\nNow that we use tight polynomials it makes sense to count things differently for our stats.\n\nI'm gathering info in particular to see if it makes sense to use `commit_sparse` (which we _are_ using now). From what I can see, probably not, or we should do it dynamically based on sparseness information.\n\nStats from the bulk test.\n\n```\nMedian column fullness: 90%\nAverage column fullness: 66%\nFullness of all columns, ignoring empty ones:\n  1: 100%  705: 100%  695: 100%  691: 100%  690: 100%  689: 100%  688: 100%  657: 100%  649: 100%  638: 100%  \n637: 100%  636: 100%  632: 100%  268: 100%  267: 100%  194: 100%    0: 100%   25: 100%   15: 100%   20: 100%  \n 11: 100%    8: 100%    2: 100%   66:  99%  175:  99%   75:  99%   90:  99%  101:  99%  108:  99%  117:  99%  \n136:  99%  149:  99%  150:  99%  153:  99%  156:  99%  157:  99%  158:  99%  176:  99%  177:  99%  178:  99%  \n186:  99%    3:  99%  196:  99%  308:  99%  307:  99%  302:  99%  282:  99%  275:  99%  274:  99%   35:  99%  \n631:  99%  650:  99%   12:  99%   48:  99%    4:  99%  644:  98%  276:  98%  273:  98%    6:  96%  672:  96%  \n666:  96%  673:  96%  658:  95%  120:  94%  139:  92%  141:  92%  143:  92%  140:  92%  144:  92%  121:  92%  \n674:  91%   43:  91%  682:  91%   46:  91%  678:  91%  677:  91%  675:  91%  472:  90%  471:  90%  454:  90%  \n445:  90%  470:  90%  455:  90%  456:  90%  457:  90%  458:  90%  459:  90%  469:  90%  468:  90%  460:  90%  \n461:  90%  467:  90%  466:  90%  465:  90%  462:  90%  463:  90%  464:  90%  485:  90%  497:  90%  496:  90%  \n495:  90%  494:  90%  493:  90%  492:  90%  491:  90%  490:  90%  489:  90%  488:  90%  487:  90%  486:  90%  \n473:  90%  484:  90%  483:  90%  482:  90%  481:  90%  480:  90%  479:  90%  478:  90%  477:  90%  476:  90%  \n475:  90%  474:  90%  401:  90%  426:  90%  425:  90%  424:  90%  423:  90%  422:  90%  421:  90%  400:  90%  \n420:  90%  419:  90%  418:  90%  417:  90%  416:  90%  415:  90%  427:  90%  402:  90%  403:  90%  414:  90%  \n404:  90%  405:  90%  413:  90%  412:  90%  411:  90%  410:  90%  409:  90%  408:  90%  406:  90%  439:  90%  \n452:  90%  451:  90%  450:  90%  449:  90%  448:  90%  447:  90%  446:  90%  407:  90%  444:  90%  443:  90%  \n442:  90%  441:  90%  440:  90%  453:  90%  438:  90%  437:  90%  398:  90%  436:  90%  435:  90%  434:  90%  \n433:  90%  432:  90%  431:  90%  430:  90%  429:  90%  428:  90%  565:  90%  578:  90%  577:  90%  576:  90%  \n575:  90%  574:  90%  573:  90%  572:  90%  571:  90%  570:  90%  569:  90%  568:  90%  567:  90%  566:  90%  \n579:  90%  564:  90%  563:  90%  562:  90%  561:  90%  560:  90%  559:  90%  558:  90%  557:  90%  556:  90%  \n555:  90%  554:  90%  553:  90%  593:  90%  629:  90%  627:  90%  626:  90%  625:  90%  624:  90%  623:  90%  \n622:  90%  621:  90%  620:  90%  619:  90%  618:  90%  617:  90%  594:  90%  552:  90%  592:  90%  591:  90%  \n590:  90%  589:  90%  587:  90%  586:  90%  585:  90%  584:  90%  583:  90%  582:  90%  581:  90%  580:  90%  \n511:  90%  524:  90%  523:  90%  522:  90%  521:  90%  520:  90%  519:  90%  518:  90%  517:  90%  516:  90%  \n515:  90%  514:  90%  513:  90%  512:  90%  525:  90%  510:  90%  509:  90%  508:  90%  507:  90%  506:  90%  \n505:  90%  504:  90%  503:  90%  502:  90%  501:  90%  500:  90%  499:  90%  538:  90%  551:  90%  550:  90%  \n549:  90%  548:  90%  547:  90%  546:  90%  545:  90%  544:  90%  543:  90%  542:  90%  541:  90%  540:  90%  \n539:  90%  498:  90%  537:  90%  536:  90%  535:  90%  534:  90%  533:  90%  532:  90%  531:  90%  530:  90%  \n529:  90%  528:  90%  527:  90%  526:  90%  352:  90%  343:  90%  344:  90%  345:  90%  346:  90%  347:  90%  \n348:  90%  349:  90%  350:  90%  351:  90%  342:  90%  353:  90%  354:  90%  355:  90%  356:  90%  357:  90%  \n358:  90%  359:  90%  360:  90%  333:  90%  399:  90%  326:  90%  327:  90%  328:  90%  329:  90%  330:  90%  \n331:  90%  332:  90%  397:  90%  334:  90%  335:  90%  336:  90%  337:  90%  338:  90%  339:  90%  340:  90%  \n341:  90%  388:  90%  380:  90%  381:  90%  382:  90%  383:  90%  384:  90%  385:  90%  386:  90%  387:  90%  \n362:  90%  389:  90%  390:  90%  391:  90%  392:  90%  393:  90%  394:  90%  395:  90%  396:  90%  378:  90%  \n379:  90%  361:  90%  363:  90%  364:  90%  365:  90%  366:  90%  367:  90%  368:  90%  369:  90%  370:  90%  \n371:  90%  372:  90%  373:  90%  374:  90%  375:  90%  376:  90%  377:  90%   44:  89%  312:  88%  305:  88%  \n 31:  87%   72:  86%  676:  86%   45:  85%  280:  84%  311:  84%   91:  83%  163:  80%  185:  80%  272:  78%  \n190:  74%  199:  74%  182:  73%  187:  70%  132:  70%  125:  70%    5:  66%  197:  65%  180:  63%  119:  63%  \n165:  60%  700:  60%  135:  57%   62:  56%   63:  53%   64:  53%   49:  51%  671:  50%  670:  50%  668:  50%  \n667:  50%  680:  50%   18:  50%  145:  50%  146:  50%  148:  50%  174:  47%  701:  44%  287:  39%  281:  39%  \n 41:  37%  588:  36%  192:  36%  164:  35%  198:  34%  285:  34%  181:  34%   37:  34%   38:  34%  151:  33%  \n651:  33%  652:  33%  642:  32%  653:  32%  654:  32%  635:  32%  655:  32%  656:  32%  122:  29%  201:  28%  \n236:  28%   39:  26%   67:  25%   40:  21%  203:  18%  123:  18%  286:  18%   53:  17%   10:  16%  283:  15%  \n200:  13%  173:  13%  230:  13%  702:  13%  183:  13%  683:  11%  696:  11%   52:  10%  248:   9%  166:   9%  \n 42:   8%   54:   8%  697:   8%    7:   7%  685:   7%  229:   7%  288:   7%  234:   6%  270:   5%   55:   4%  \n235:   3%  278:   3%   33:   3%   71:   3%   56:   3%  167:   3%  693:   3%  218:   3%   50:   3%   28:   2%  \n227:   2%  226:   2%  304:   1%   74:   1%   59:   1%    9:   1%  155:   1%  643:   1%   30:   1%  208:   1%  \n646:   1%  665:   1%  238:   1%  239:   1%  692:   0%   27:   0%  687:   0%   58:   0%  686:   0%   57:   0%  \n684:   0%  704:   0%  660:   0%  659:   0%   47:   0%  703:   0%   51:   0%  694:   0%  258:   0%  241:   0%  \n243:   0%  244:   0%  245:   0%  246:   0%  247:   0%  249:   0%  250:   0%  251:   0%  252:   0%  253:   0%  \n254:   0%  255:   0%  256:   0%  257:   0%  240:   0%  261:   0%  269:   0%  277:   0%  289:   0%  290:   0%  \n291:   0%  292:   0%  293:   0%  294:   0%  295:   0%  296:   0%  297:   0%  303:   0%  309:   0%  212:   0%  \n 68:   0%   73:   0%  152:   0%  160:   0%  161:   0%  162:   0%  188:   0%  189:   0%  195:   0%  204:   0%  \n206:   0%  207:   0%  209:   0%  210:   0%  211:   0%   65:   0%  214:   0%  215:   0%  216:   0%  217:   0%  \n219:   0%  220:   0%  222:   0%  223:   0%  224:   0%  225:   0%  231:   0%  232:   0%  233:   0%  237:   0%  \nDetails for 20 most sparse columns:\nColumn main_sel_op_msm: 2 non-zero entries out of 28048 (0%)\nColumn main_sel_op_l2gasleft: 1 non-zero entries out of 28904 (0%)\nColumn main_sel_op_l1_to_l2_msg_exists: 1 non-zero entries out of 35497 (0%)\nColumn main_sel_op_keccak: 1 non-zero entries out of 14710 (0%)\nColumn main_sel_op_get_contract_instance: 3 non-zero entries out of 28157 (0%)\nColumn main_sel_op_fee_per_l2_gas: 1 non-zero entries out of 28740 (0%)\nColumn main_sel_op_fee_per_da_gas: 1 non-zero entries out of 28825 (0%)\nColumn main_sel_op_fdiv: 40 non-zero entries out of 27798 (0%)\nColumn main_sel_op_external_return: 3 non-zero entries out of 36569 (0%)\nColumn main_sel_op_external_call: 1 non-zero entries out of 35820 (0%)\nColumn main_sel_op_emit_unencrypted_log: 3 non-zero entries out of 35147 (0%)\nColumn main_sel_op_emit_nullifier: 1 non-zero entries out of 35335 (0%)\nColumn main_sel_op_emit_note_hash: 1 non-zero entries out of 35291 (0%)\nColumn main_sel_op_emit_l2_to_l1_msg: 1 non-zero entries out of 35580 (0%)\nColumn alu_remainder: 6 non-zero entries out of 6708 (0%)\nColumn main_sel_op_debug_log: 31 non-zero entries out of 36202 (0%)\nColumn main_sel_op_dagasleft: 1 non-zero entries out of 28983 (0%)\nColumn main_sel_op_chain_id: 1 non-zero entries out of 28426 (0%)\nColumn main_sel_op_calldata_copy: 6 non-zero entries out of 36361 (0%)\nColumn main_sel_op_block_number: 1 non-zero entries out of 28580 (0%)\n```",
          "timestamp": "2025-01-09T19:54:49Z",
          "tree_id": "bbf742f19e4c87e4dcfd7b6e2c5fd14132346f41",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/535a14c8c59399ce7579c69f6aec862f71981699"
        },
        "date": 1736453938176,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19705.740804000015,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16925.128748000003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21604.69227300001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18835.069935 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4649.140547000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4260.5637320000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 71873.770908,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 71873771000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14210.19371,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14210193000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3086929751,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3086929751 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 144588502,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 144588502 ns\nthreads: 1"
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
          "id": "34be2c3800c2d99c11fe3448e01c77abf60c726d",
          "message": "feat: Use tail public inputs as transaction hash (#11100)\n\nImplements https://github.com/AztecProtocol/aztec-packages/issues/9269\r\nSeparates the role of the first nullifier and the transaction hash. The\r\ntransaction hash is now the hash of the tail public inputs. The first\r\nnullifier is still used for note uniqueness and replayability protection",
          "timestamp": "2025-01-10T13:51:37+01:00",
          "tree_id": "954a1d32e2052bd9ff91868bf26ab420d9a69401",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/34be2c3800c2d99c11fe3448e01c77abf60c726d"
        },
        "date": 1736514455835,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19509.69868100003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16789.389673 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21627.030649999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19110.811681000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4611.245942999972,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4317.705172999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 79875.7591,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 79875759000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14137.017693999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14137019000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3067576434,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3067576434 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142691413,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142691413 ns\nthreads: 1"
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
          "id": "1775e53025f9946ba26b8b624a0f15f4ccdabd2f",
          "message": "chore(avm): fix mac build (#11147)\n\nUse bb's format.",
          "timestamp": "2025-01-10T07:52:32-05:00",
          "tree_id": "095d9448e20d5a5621ded9d10f69deb782c7946a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1775e53025f9946ba26b8b624a0f15f4ccdabd2f"
        },
        "date": 1736514947594,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19683.27144099999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16846.750724 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21658.03216400002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18987.16519 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4657.856092999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4270.3855490000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72659.365212,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72659366000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14205.783152,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14205784000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3097528664,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3097528664 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141463603,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141463603 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "105737703+iakovenkos@users.noreply.github.com",
            "name": "iakovenkos",
            "username": "iakovenkos"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "f034e2af6f372e393b63ff19ca6d118d03506e1f",
          "message": "chore: SmallSubgroupIPA tests  (#11106)\n\nThis PR is a follow-up to\r\nhttps://github.com/AztecProtocol/aztec-packages/pull/10773",
          "timestamp": "2025-01-10T16:02:56+01:00",
          "tree_id": "de591a29d292670f55a454aff016075fe862cbac",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f034e2af6f372e393b63ff19ca6d118d03506e1f"
        },
        "date": 1736522376866,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19702.800213999977,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16957.071715000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21603.053388999968,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18853.246948000004 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4630.27372199997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4256.731673 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 76677.342763,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 76677343000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14148.409610999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14148411000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3148715909,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3148715909 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 145031539,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 145031539 ns\nthreads: 1"
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
          "id": "231f017d14c3d261b28ab19dcbdf368c561d0cc7",
          "message": "feat(avm2): avm redesign init (#10906)\n\nThis is a redesign of the witgen/proving part of the AVM. There's still a lot of work to be done, but I have to merge at some point to let others contribute :). Most of the content is PoC, not supposed to be real.\n\nWe'll eventually have a doc explaining everything, but for now, some highlights:\n\n**Architecture**\n\nThe proving process is now divided in 3 parts:\n* Simulation (aka event generation): Intrinsically sequential. Executes bytecode and generates packed information (events) that summarize what happened. Examples would be a bytecode decomposition event, memory access event, etc. This part has no dependencies on BB or PIL beyond FF. It also has, in principle, no knowledge of the circuit or columns.\n* Trace generation: This part is parallelizable. The meat of it is translating events into columns in a (sparse!) trace. It is the glue between events and the circuit. It has knowledge of the columns, but not really about any relation or constrain (**) or PIL.\n* Constraining: This is parallelizable. It's the actual constraining/proving/check circuit. It's dependent on BB and the (currently) autogenerated relations from PIL. We convert the sparse trace to polynomials.\n\n**Possible future standalone simulation**\n\nHints and DB accesses: The simulation/witgen process has no knowledge of hints (so far). We define a DB interface which the simulation process uses. This DB is then \"seeded\" with hints. This means that in the future it should be possible to switch the DB to a real DB and things should \"just work™️\".\n\nI think we should try to follow this philosophy as much as possible and not rely on TS hints that we can compute ourselves.\n\nConfigurability: Other aspects of simulation are configurable. E.g., we can configure a fast simulation only variant that does no event generation and no bytecode hashing whereas for full proving you would do that (incurring in at least 25ms for a single bytecode hashing).\n\n**Philosophy**\n\nDependency injection is used everywhere (without framework). You'll see references stored in classes and may not like it, but it's actually working well. See https://www.youtube.com/watch?v=kCYo2gJ3Y38 as well.\n\nThere are lots of interfaces for mocking. Blame C++ 🤷 .\n\nI'm making it a priority to have the right separation of concerns and engineering practices. There's zero tolerance on hacks. If we need a hack, we trigger a refactor.\n\n**Testing**\n\nWhereas before our tests required setting up everything and basically do full proving or check circuit, now everything can be tested separately. We use a mockist approach (common in C++). Our old tests would take ~0.5s each, now they take microseconds. Simulation, tracegen, and constraining can be tested separate from each other. In particular, you can create tests for constraints at the relation or subrelation level.\n\n**Lookups/permutations**\n\nNot really supported yet. But you don't need to keep counts for lookups.\n\n**TS/C++ communication**\n\nAVM inputs are now (de)serialized with messagepack.\n\n(**) It does require lookup/permutation settings.",
          "timestamp": "2025-01-11T20:55:45Z",
          "tree_id": "8f4ae741e32d0a2cb5fb1ef81efd6ce4d8745daf",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/231f017d14c3d261b28ab19dcbdf368c561d0cc7"
        },
        "date": 1736629928863,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19726.704048999978,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16905.705488 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21543.202395000037,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18804.36867 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4667.03118800001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4268.412715000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 81955.39306799999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 81955394000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14143.177046999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14143178000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3337463545,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3337463545 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 155250859,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 155250859 ns\nthreads: 1"
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
          "id": "6de4013c1204b3478b6d444c0cff5ca9c5c6cd03",
          "message": "chore(avm): vm2 followup cleanup (#11186)",
          "timestamp": "2025-01-13T17:25:48Z",
          "tree_id": "a4773f6dd8d9707bdfe01f80da1bc8a293ce4368",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6de4013c1204b3478b6d444c0cff5ca9c5c6cd03"
        },
        "date": 1736790146243,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19902.811792999957,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17113.066226000003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21814.849199000037,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19124.121941999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4740.052406000018,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4363.102758000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72335.739343,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72335740000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14250.499486,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14250501000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3666230146,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3666230146 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152219009,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152219009 ns\nthreads: 1"
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
          "id": "d41e9abc8c2428be224400ec43f4844adfd954c3",
          "message": "chore: move witness computation into class plus some other cleanup (#11140)\n\nMinor cleanup/refactor of Flavor logic (particularly MegaFlavor). Mostly\ndeleting unused methods and moving that did not strictly belong in the\nFlavor to new classes `WitnessComputation` and `MegaMemoryEstimator`",
          "timestamp": "2025-01-13T10:50:54-07:00",
          "tree_id": "dd0282685a034e833deb01e1aba778772121189f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d41e9abc8c2428be224400ec43f4844adfd954c3"
        },
        "date": 1736792140646,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19496.567465,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16854.790723000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21619.380548000037,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18885.752178 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4430.973205999976,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4043.220895 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 81710.988247,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 81710989000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13546.073715,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13546073000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3712746309,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3712746309 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 157769756,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 157769756 ns\nthreads: 1"
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
          "id": "58fdf87560fc2c43255675c83dbc36eb370ca5b0",
          "message": "chore: refactor Solidity Transcript and improve error handling in  sol_honk flow (#11158)\n\nA cleanup PR in preparation for the ZK contract\r\n* create a RelationParameters struct so functions in `RelationsLib`\r\ndon't need to take the Transcript as function argument ( this will be\r\nuseful to reuse this library for both the zk and non-zk contract)\r\n* make `loadProof` less manual and more robust by creating some utility\r\nfunctions\r\n* ensure the `sol_honk` flow actually displays contract compilation\r\nerrors and clear errors (if possible) when deploying to aid debugging",
          "timestamp": "2025-01-13T18:10:12Z",
          "tree_id": "57d5e054a68a17745d84b91fa3a6bba6165b74cc",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/58fdf87560fc2c43255675c83dbc36eb370ca5b0"
        },
        "date": 1736793295892,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19485.702408999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16643.027778 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21680.76442500001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18908.085911000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4477.601942000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4187.847456 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 80369.192673,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 80369193000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13644.3322,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13644333000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3173461811,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3173461811 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 149391220,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 149391220 ns\nthreads: 1"
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
          "id": "c4f44520a8cc234219f7e9e021b0574a894aa06e",
          "message": "fix(avm): mac build (#11195)",
          "timestamp": "2025-01-13T18:51:40Z",
          "tree_id": "9bdde1c852ce97f658e0f01f544ef9d7cba3389b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c4f44520a8cc234219f7e9e021b0574a894aa06e"
        },
        "date": 1736795826106,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19021.618668000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16178.408088999997 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21630.40817700002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19173.144274 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4074.526970999983,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3763.3456889999998 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 74170.52600499999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 74170527000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14640.452328,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14640453000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3089964160,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3089964160 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133608330,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133608330 ns\nthreads: 1"
          }
        ]
      }
    ]
  }
}