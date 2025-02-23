window.BENCHMARK_DATA = {
  "lastUpdate": 1740346404238,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "C++ Benchmark": [
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
          "id": "842259495fa91c6213352d89ca04dc1b568809d0",
          "message": "feat: Sync from noir (#12119)\n\nAutomated pull of development from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nfeat(cli): add noir-execute binary\n(https://github.com/noir-lang/noir/pull/7384)\nchore!: make `ResolverError::OracleMarkedAsConstrained` into a full\nerror (https://github.com/noir-lang/noir/pull/7426)\nchore: simplify reports (https://github.com/noir-lang/noir/pull/7421)\nfix: do not discard negative sign from field literals in comptime\ninterpreter (https://github.com/noir-lang/noir/pull/7439)\nchore: bump aztec-packages commit\n(https://github.com/noir-lang/noir/pull/7441)\nfix: require loop/for/while body to be unit\n(https://github.com/noir-lang/noir/pull/7437)\nfeat: simplify assertions that squared values are equal to zero\n(https://github.com/noir-lang/noir/pull/7432)\nchore(benchmark): Improve noir msm benchmark\n(https://github.com/noir-lang/noir/pull/7390)\nchore: Add SSA security checks description\n(https://github.com/noir-lang/noir/pull/7366)\nEND_COMMIT_OVERRIDE\n\n---------\n\nCo-authored-by: Tom French <tom@tomfren.ch>",
          "timestamp": "2025-02-19T20:21:09Z",
          "tree_id": "a59f14814a49dc2fd23ce82b389a11196f7af3cc",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/842259495fa91c6213352d89ca04dc1b568809d0"
        },
        "date": 1739997832309,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18124.856575999955,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15984.135388 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18628.07511300002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16248.435046 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3833.9413589999367,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3045.0692719999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55012.70908099999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55012709000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11084.949202,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11084951000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1818691600,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1818691600 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 130259474,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 130259474 ns\nthreads: 1"
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
          "id": "c1cc3edaa4cb31c4df8a5f9255abb96afca61a53",
          "message": "chore: prep for switching AVM to checkpointed native trees - TS test cleanup and refactors (#12023)\n\nThis PR is mostly setup for switching the AVM to use checkpointed native\ntrees. Originally I had that in the same branch, but there were enough\nof these prerequisite changes to pull them out.\n\n## Orchestrator testing\n\nprover-client's `TestContext` no longer mocks AVM simulation.\n\nContext: while trying to transition the AVM to use native checkpointed\ntrees, I ran into issues with the orchestrator public functions tests\nbecause the public processor will no longer update the trees for public\nfunctions. So, I think we should stop mocking the AVM simulation for\nthese tests and let the AVM do its tree updates. We can then do two\ntypes of tests:\n1. A quick test that doesn't actually deploy/run any real contract\nfunctions and instead tests the orchestrator with a mocked/garbage TX\nthat has 1 _revertible_ enqueued call. The AVM will fail to retrieve\nit's bytecode, but the TX can still be included.\n`orchestrator_public_functions.test.ts` now does this.\n2. A real test that creates TXs that actually do a bunch of real token\noperations via non-revertible and revertible enqueued calls.\n`orchestrator_multi_public_functions.test.ts` now does this.\n\n## AVM & PublicProcessor testing\n- `PublicTxSimulationTester` lets you `createTx` separately from\n`simulateTx` (useful for testing `PublicProcessor`)\n- Add `PublicTxSimulator` test for avm bulk test\n- Add a `PublicProcessor` test of the token contract (construct, mint,\nmany transfers)\n- Consolidate some duplicate helper functions in `simulator/src/avm` and\n`simulator/src/public`\n- Simplify process of registering/deploying contracts via avm `*Tester`\nclasses, and optional contract address nullifier insertion\n- Contract Updates test now use the tester's `register*()` function\ninstead of manually constructing contract classes and instances\n- Remove unused function from avm test contract\n\n## Misc\n- Making contract classes for tests is now deterministic (no more random\npublic keys)\n- Use new/proper sha256 in benchmarking test contract",
          "timestamp": "2025-02-19T20:24:12Z",
          "tree_id": "4d23da1790d2796003b102e152ea35edaa5e4143",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c1cc3edaa4cb31c4df8a5f9255abb96afca61a53"
        },
        "date": 1739998122077,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18174.130155999817,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16046.827890000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18674.065616000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16425.904902 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4012.7862280000954,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3194.9403589999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55113.677690000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55113676000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9599.509925,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9599513000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1796932290,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1796932290 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128071619,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128071619 ns\nthreads: 1"
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
          "id": "d8b595ec45c404ccd1c9f77e73fa3e422adeec0e",
          "message": "chore: Remove the nightly run of the AVM full tests Github action (#12115)",
          "timestamp": "2025-02-19T21:11:34Z",
          "tree_id": "3c814eefe8a9dc4d5a9064b7fcdff278444a7b24",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d8b595ec45c404ccd1c9f77e73fa3e422adeec0e"
        },
        "date": 1740000200070,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18144.232449000072,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15822.631369999997 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18630.69992999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16307.825649999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3844.839653000008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3088.617308 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54779.173491,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54779176000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10243.176558,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10243183000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1827416215,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1827416215 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 136352528,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 136352528 ns\nthreads: 1"
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
          "distinct": true,
          "id": "2e83891b1b1d080febe5f3eac5dfe51e5844cf06",
          "message": "fix: allow empty blocks in aztec chart (#12120)\n\nUn-bricks aztec network deployments which had been bricked with the\nfollowing while deploying the bot:\n\n![Screenshot 2025-02-19 at\n14.49.19.png](https://graphite-user-uploaded-assets-prod.s3.amazonaws.com/RJpsSZ0TcXRNQxCJ6yLa/556c579d-4ab1-4283-a004-923800b5d852.png)",
          "timestamp": "2025-02-19T21:25:30Z",
          "tree_id": "bbcaa1f719ff0f8ed676e13f6bf3c2978bf78d25",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2e83891b1b1d080febe5f3eac5dfe51e5844cf06"
        },
        "date": 1740001499100,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18049.59291800003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15872.206561 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18677.755866999974,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16207.680209999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3873.2843420000336,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3086.994440000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54812.938266,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54812938000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10738.042378999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10738047000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1815968992,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1815968992 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 129169519,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 129169519 ns\nthreads: 1"
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
          "id": "ef79f9db2be27ef18a654c5741d3ce569c862eb5",
          "message": "chore: work around bugs using cache_content_hash (#12124)",
          "timestamp": "2025-02-19T22:34:16Z",
          "tree_id": "d601b2fb4df776ca8e16608ceb175cabb4c40e2c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ef79f9db2be27ef18a654c5741d3ce569c862eb5"
        },
        "date": 1740005132482,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18103.247091000016,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15947.868847000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18595.096248999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16189.481756000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3922.598461000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3111.249001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54942.842754,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54942841000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10652.363448,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10652370000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1805018367,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1805018367 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128749792,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128749792 ns\nthreads: 1"
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
          "id": "cca368a7610994f4f7395c30dc346f957d0838e4",
          "message": "chore: Do not allow changes to package json during CI yarn install (#12125)\n\nRunning `yarn install` will format the package.json for all packages in\nthe workspace. This will cause `cache_content_hash` to fail on CI due to\nchanged files, which (before #12124) caused the build to terminate\nabruptly (see\n[here](https://github.com/AztecProtocol/aztec-packages/actions/runs/13422411604/job/37497960586?pr=12096#step:7:109)\nfor an example).\n\nThis PR adds all package.json files to yarn's `immutablePatterns`, so if\nit detects that the install process changed them it, it will fail with\n`The checksum for **/package.json has been modified by this install,\nwhich is explicitly forbidden.` and a nice exit code, which should be\nvisible on the CI run. This only applies to CI runs.",
          "timestamp": "2025-02-19T23:11:56Z",
          "tree_id": "fb5225cc530e0d469ae4f2e9901f35d4e80e9eeb",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cca368a7610994f4f7395c30dc346f957d0838e4"
        },
        "date": 1740008015863,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18090.115338000032,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15987.573651000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18616.665270000114,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16186.237868999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3950.5706100001134,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3125.853458000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54824.953991,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54824950000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9451.156151000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9451159000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1810676778,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1810676778 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128231432,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128231432 ns\nthreads: 1"
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
          "id": "5a9322152e97e419d7726c6db4acc20efb1e1b32",
          "message": "feat: optimizing `SharedMutable` storage slots (#11817)",
          "timestamp": "2025-02-20T08:44:45Z",
          "tree_id": "444f6c638b31edddfd2b8247063c202094fe7abd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5a9322152e97e419d7726c6db4acc20efb1e1b32"
        },
        "date": 1740042821986,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18529.253922999942,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16254.867530999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18807.33665499997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16534.111365 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3992.270499999904,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3148.7602030000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55266.786405000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55266786000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10482.915822,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10482922000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1829998598,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1829998598 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 130694072,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 130694072 ns\nthreads: 1"
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
          "id": "279ecd584036a6bf7c734a9bd5f6f9d7e8e55b63",
          "message": "fix: remove kv-store generate step (#12112)\n\nThis generate step is exclusively handled by `@aztec/native` now.",
          "timestamp": "2025-02-20T09:28:16Z",
          "tree_id": "7dc620c251f21c287554596c4c19b469124a330e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/279ecd584036a6bf7c734a9bd5f6f9d7e8e55b63"
        },
        "date": 1740045175873,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18268.602830999953,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16078.762226000003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18772.92474199999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16358.472887999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3970.5071099999714,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3125.363093 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55129.353318,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55129353000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12682.430307000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12682436000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1810778400,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1810778400 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 138309319,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 138309319 ns\nthreads: 1"
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
          "id": "1c3bc4aa8cc006773221b2d4937fbe72219d14f2",
          "message": "fix: vite box with fees (#12131)\n\nFixes vite test by using the test accounts in the sandbox\n\n---------\n\nCo-authored-by: thunkar <gregjquiros@gmail.com>",
          "timestamp": "2025-02-20T10:56:02+01:00",
          "tree_id": "0930a32febc533b3521cd29affb6e2d97e0b1f6c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1c3bc4aa8cc006773221b2d4937fbe72219d14f2"
        },
        "date": 1740046169117,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18029.530293999982,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15835.231758 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18646.42721300004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16097.994311999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3857.2563290000517,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3052.622598 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55012.67099400001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55012671000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11932.824677999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11932831000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1824479044,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1824479044 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128323209,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128323209 ns\nthreads: 1"
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
          "id": "b088422d7a1d04b7b666e34e631d783dac01612e",
          "message": "refactor: replace kv-store backend in pxe, key store and wallet (#12087)\n\nFix #11658",
          "timestamp": "2025-02-20T10:52:10Z",
          "tree_id": "519e4b192ac47d4f436eead8d842cbaaaf347184",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b088422d7a1d04b7b666e34e631d783dac01612e"
        },
        "date": 1740049498367,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18112.526052000023,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15982.122671 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18523.48228300002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16019.026635 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3908.309978000034,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3059.261392 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54759.235129,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54759234000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10971.710576000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10971714000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1833658780,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1833658780 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 130442489,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 130442489 ns\nthreads: 1"
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
          "distinct": true,
          "id": "e6f5a09ec48725492b8d57cb0c3fe58b1a963f5a",
          "message": "feat: poseidon2 encryption (#11919)\n\nAddresses the comments from this old PR:\nhttps://github.com/AztecProtocol/aztec-packages/pull/11400\n\nIntroduces Poseidon2 encryption, but doesn't plug it into any example\ncontracts.\n\n---------\n\nCo-authored-by: Nicolás Venturo <nicolas.venturo@gmail.com>",
          "timestamp": "2025-02-20T11:47:05Z",
          "tree_id": "ef49b27bc09e13b9fa847c10c356af432aed10f2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e6f5a09ec48725492b8d57cb0c3fe58b1a963f5a"
        },
        "date": 1740053518796,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18396.443440999974,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16294.722855000004 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18643.066668000072,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16478.541812 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3986.5724819999286,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3226.255476 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55089.482207,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55089483000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9577.864743,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9577870000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1830206858,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1830206858 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 135784583,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 135784583 ns\nthreads: 1"
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
          "id": "8effaa1d459d54a83d0d56f9948367de6bf1ca3a",
          "message": "chore: Reinstate orchestrator workflow test (#12121)\n\nFixes #11870",
          "timestamp": "2025-02-20T10:39:48-03:00",
          "tree_id": "05a5b9f7ccdd263f4cb87019686f35011c302c38",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8effaa1d459d54a83d0d56f9948367de6bf1ca3a"
        },
        "date": 1740060094512,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18107.019303000015,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15933.386844999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18579.38439999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16198.419140999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3870.387400000027,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3105.7189940000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54837.687836,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54837688000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11527.325481,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11527330000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1812814908,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1812814908 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 131763707,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 131763707 ns\nthreads: 1"
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
          "id": "3257a973a5645725d3cb52c375012c901e66c5db",
          "message": "chore: @aztec/stdlib pt.2 -> remove @aztec/types (#12133)\n\nWith granular exports and circular dependencies removed it's not longer\nnecessary!\n\nRemaining types were moved to `circuits.js` (soon to be stdlib), but the\nhasher will probably get pruned since it's only used by the old merkle\ntree implementation\n\n---------\n\nCo-authored-by: thunkar <gregjquiros@gmail.com>",
          "timestamp": "2025-02-20T15:19:27+01:00",
          "tree_id": "57c67c018a5a459796338fe97842d91fce777d00",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3257a973a5645725d3cb52c375012c901e66c5db"
        },
        "date": 1740062656648,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18253.801918999896,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16096.685931 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18723.16895599988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16363.835618 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3867.063815999927,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3114.7848810000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55023.702245,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55023700000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10338.371763000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10338375000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1826486356,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1826486356 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 131246661,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 131246661 ns\nthreads: 1"
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
          "id": "4df7b2ad5df07a0de8d9f73bc145b40556e5dac2",
          "message": "fix: don't early-out on test fails (#12143)",
          "timestamp": "2025-02-20T15:11:30Z",
          "tree_id": "7d5943b5a25563463e6e9f302e4e9dabd407843b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4df7b2ad5df07a0de8d9f73bc145b40556e5dac2"
        },
        "date": 1740065609214,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18201.03717899997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16105.861745999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18651.075863999948,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16254.706436999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3831.9496430001436,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3067.0336150000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54816.890185,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54816889000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9731.422381,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9731423000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1810750906,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1810750906 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128864046,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128864046 ns\nthreads: 1"
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
          "id": "b0cdf2019cbf90bed0d57bc1411203267c102578",
          "message": "chore: Silence warns on invalid bootnode enr (#12135)\n\nIf the bootnode enr is not valid and the node has been instructed to\nskip its check, it will still connect to it and discover peers, but will\nfrequently emit a warning on the logs.\n\nThis silences it.",
          "timestamp": "2025-02-20T15:14:03Z",
          "tree_id": "834e1ffd5716f1da47698b9f7a6e40f7b9fd6305",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b0cdf2019cbf90bed0d57bc1411203267c102578"
        },
        "date": 1740065957138,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18212.068661000103,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15971.591951999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18787.492907000116,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16342.070103000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3933.419173999937,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3162.4170040000004 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54924.988731,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54924990000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10888.3467,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10888349000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1813094573,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1813094573 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128771741,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128771741 ns\nthreads: 1"
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
          "id": "bdef653a86af82a28fe48e01a62694b9dc213d6d",
          "message": "chore(ci3): refactor ci3.yml, fix external PR flow (#12037)\n\n- Refactor amd64 and arm64 to be a single ci task with a matrix\n- Fix the logic around external PRs, control this with a ci-external\nlabel",
          "timestamp": "2025-02-20T23:49:57+08:00",
          "tree_id": "a97f91220f779b6b1794b535ce15f5e9e6bb8bb1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/bdef653a86af82a28fe48e01a62694b9dc213d6d"
        },
        "date": 1740067863458,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18078.547531000142,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15940.900983 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18741.183973000036,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16511.859543 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3880.408550999846,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3078.2916720000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54890.65631,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54890657000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11393.961265,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11393964000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1831022034,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1831022034 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128666967,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128666967 ns\nthreads: 1"
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
          "distinct": true,
          "id": "fbc5a01bdfea48372ff03dd5d17f7ab9a3f46220",
          "message": "chore: fix message path (#12150)",
          "timestamp": "2025-02-20T16:49:41Z",
          "tree_id": "1536644955dfe78c4728b17ae11aa7cfb450031f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fbc5a01bdfea48372ff03dd5d17f7ab9a3f46220"
        },
        "date": 1740071674167,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18541.917396000143,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16166.175491 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19068.801110999855,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16757.575199 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3975.073665999844,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3132.2478119999996 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55107.852822,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55107852000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9978.643957,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9978647000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1838466691,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1838466691 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 131350312,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 131350312 ns\nthreads: 1"
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
          "id": "853120864ffbf1556a6308d731cf881a436d08ef",
          "message": "fix: external fixes pt 2 (#12153)\n\nCo-authored-by: esau <152162806+sklppy88@users.noreply.github.com>",
          "timestamp": "2025-02-20T11:58:49-05:00",
          "tree_id": "245dec764dac9c533969e404d851d0d143821503",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/853120864ffbf1556a6308d731cf881a436d08ef"
        },
        "date": 1740072018949,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18263.350940999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16155.336882 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18724.325634000023,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16446.725506 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3884.4535120001638,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3035.2229909999996 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54563.800512,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54563801000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9802.288078,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9802290000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1818968524,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1818968524 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128438973,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128438973 ns\nthreads: 1"
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
          "id": "4ee688431aa6e23f2b298086ec62a8403e312114",
          "message": "feat: partial note handling in aztec-nr (#12122)\n\nWe're back! Reopening\nhttps://github.com/AztecProtocol/aztec-packages/pull/11641, which was\nreverted in https://github.com/AztecProtocol/aztec-packages/pull/11797.\n\n---------\n\nCo-authored-by: Jan Beneš <janbenes1234@gmail.com>",
          "timestamp": "2025-02-20T17:35:40Z",
          "tree_id": "e8f6f5a56816c5bb62e255334a36fd49f7dcfa91",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4ee688431aa6e23f2b298086ec62a8403e312114"
        },
        "date": 1740074631302,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18343.47760300011,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16115.009612000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18780.114714999854,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16392.516203 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4027.2880839997924,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3172.180459 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54979.365115,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54979365000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11695.784972999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11695789000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1843370620,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1843370620 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 135678357,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 135678357 ns\nthreads: 1"
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
          "id": "2b91bb2ac7be55d51bbd6d32c84df45e3b026312",
          "message": "fix: don't try to get bench artifacts on external PR (#12157)",
          "timestamp": "2025-02-21T02:03:42+08:00",
          "tree_id": "5f595b6ed91f22a2fe294417e1caa29263c41c61",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2b91bb2ac7be55d51bbd6d32c84df45e3b026312"
        },
        "date": 1740075345949,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18275.414823000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16002.203463000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18698.170157999983,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16298.890077 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3822.322208000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3067.9369809999994 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54700.503288,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54700503000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9300.645835000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9300650000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1814502432,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1814502432 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 129861415,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 129861415 ns\nthreads: 1"
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
          "id": "5efd21c060bc7a40abd548c80fca0a76b64bfba5",
          "message": "chore(ci3): update ci.md with swc notes (#12147)\n\nCo-authored-by: Santiago Palladino <santiago@aztecprotocol.com>",
          "timestamp": "2025-02-20T13:11:12-05:00",
          "tree_id": "a5d881d1bac750dac822e856e1ff438ee3434e97",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5efd21c060bc7a40abd548c80fca0a76b64bfba5"
        },
        "date": 1740075808110,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18051.77887000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15889.040072999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18666.800728,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16376.771206000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4021.102923000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3053.7823739999994 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54802.144065,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54802140000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11375.091290999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11375101000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1830674812,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1830674812 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 129330575,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 129330575 ns\nthreads: 1"
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
          "id": "e00a86cfa97a3d33957ffd0cc1d2b60474b57db3",
          "message": "test: verify proving is resumed after broker crash (#11122)\n\nThis test: starts proving an epoch, kills the broker, verifies the epoch\nis still proven correctly after the broker recovers\n\nThis test is currently failing because it needs #10981 first to be\nmerged in.",
          "timestamp": "2025-02-20T18:14:49Z",
          "tree_id": "5304cd7d1ddbe1077f54f44e26b7609a16903dde",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e00a86cfa97a3d33957ffd0cc1d2b60474b57db3"
        },
        "date": 1740076812110,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18390.336538999916,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16230.280509 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18768.739549999962,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16346.594033 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3989.856834000193,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3186.7133479999998 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55195.114391,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55195114000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11470.02628,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11470029000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1830069883,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1830069883 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133655668,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133655668 ns\nthreads: 1"
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
          "id": "8831838aab69f26686855730811d07c7d99d361a",
          "message": "chore: @aztec/stdlib pt. 3: aztec-address out of foundation (#12140)\n\nFinal cleanup `foundation` and removal of all aztec-specific references.\nThis paves the way for the new stdlib to be born from the remnants of\n`circuits.js` and `circuit-types`!\n\nThis has led to a single \"weird thing\":\n\n`@aztec/ethereum` requires `AztecAddress` *just for the deployment of l1\ncontracts*. In the end, this is just an arg provided to `viem` that gets\neventually stringified, so we only have the type to avoid making\nmistakes ourselves. Since this is a pretty internal method, to avoid\ncircular dependencies I've turned it into a `Fr`, as that's our\n\"flattened\" AztecAddress representation. @alexghr @spalladino how bad is\nit?\n\nAnother option would be to move `deployL1Contracts` to `circuits.js`\n(soon to be `stdlib`), as this package pulls from `ethereum` and has\naccess to AztecAddress.\n\n---------\n\nCo-authored-by: thunkar <gregjquiros@gmail.com>",
          "timestamp": "2025-02-20T19:25:54+01:00",
          "tree_id": "95de7bce4cb41c9bcafde616cf28102b5870518e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8831838aab69f26686855730811d07c7d99d361a"
        },
        "date": 1740077488687,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18396.944177000023,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16254.126714999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18804.310319999786,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16565.136599999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3919.6321000001717,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3097.849819 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55196.903116999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55196902000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10494.42185,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10494426000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1818503171,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1818503171 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128064425,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128064425 ns\nthreads: 1"
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
          "id": "db2a503e1918dd0ffa6d251e8145821b21a452ff",
          "message": "feat: Barretenberg C++ binary overhaul (#11459)\n\nOverhaul the Barretenberg binary and its API.\n- Breaks up bb main into different files organized by proving system /\nIVC scheme.\n- Make UltraHonk conform to the new API interface introduced earlier for\nClient IVC.\n- Refines the API a bit.\n- Introduces [CLI11](https://github.com/CLIUtils/CLI11) to: provide help\n/ documentation; validate opts (options can be required, exlusive of\neach other, validated against predicates like \"path exists\" or \"string\nis in list\"); also allows for easy environment variable aliasing.\n\nThis could definitely use some more a help. \n - Lots of documentation needed\n- Defaults are set in a weird and inconsistent way and that information\nisn't included in the documentation.\n- The help menus are perhaps too verbose. Subcommands can't inherit\noptions or flags so we end up repeating.\n- Empty string cannot be passed and parsed to a \"nothing argument\" which\ncan lead to frustrating debugging...\n - Little option validation is actually implemented.\n - Deprecated options aren't noted but they could be.\n\nIt was requested that the default change from UltraPlonk to UltraHonk,\nbut we get rid of a default set of commands altogether. As a workaround,\nwe can have users set `BB_SCHEME=ultra_honk`.\n\nNewly created issues:\nhttps://github.com/AztecProtocol/barretenberg/issues/1252,\nhttps://github.com/AztecProtocol/barretenberg/issues/1253,\nhttps://github.com/AztecProtocol/barretenberg/issues/1254,\nhttps://github.com/AztecProtocol/barretenberg/issues/1255,\nhttps://github.com/AztecProtocol/barretenberg/issues/1256,\nhttps://github.com/AztecProtocol/barretenberg/issues/1257,\nhttps://github.com/AztecProtocol/barretenberg/issues/1258,\nhttps://github.com/AztecProtocol/barretenberg/issues/1259\n\nResolves https://github.com/AztecProtocol/barretenberg/issues/1260\n\nNB the line count is large because 1) CLI11 is a single 11k-line header;\n2) I moved a lot of functions and some git mvs didn't show up as such.\nMain new code is api_ultra_honk.hpp.\n\n---------\n\nCo-authored-by: ludamad <adam.domurad@gmail.com>",
          "timestamp": "2025-02-20T14:12:17-05:00",
          "tree_id": "609c7313ba844c7d1e54626d92a51d472f323db5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/db2a503e1918dd0ffa6d251e8145821b21a452ff"
        },
        "date": 1740080971424,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18278.38828600011,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16138.557612999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18762.107399000117,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16345.549768 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4028.44974300001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3114.5213369999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54677.755524,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54677757000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10862.722009000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10862725000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1821180682,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1821180682 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 129311987,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 129311987 ns\nthreads: 1"
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
          "id": "b2c5744f46f8ed3a7706e625489f7e8b96570591",
          "message": "chore: Fix linter errors (#12164)",
          "timestamp": "2025-02-21T03:45:20+08:00",
          "tree_id": "214189f0d4e5939d77735a5c855bf291b96c3086",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b2c5744f46f8ed3a7706e625489f7e8b96570591"
        },
        "date": 1740082048821,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18088.37210899992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15913.639127 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18756.6091220001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16627.828038999996 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4004.538420000017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3190.2140550000004 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54715.892931,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54715895000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10789.354886,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10789358000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1808614475,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1808614475 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127403720,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127403720 ns\nthreads: 1"
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
          "id": "481d3beaba9fcc85743919bc640a849dad7b7b88",
          "message": "fix: retry rm operation in cleanup (#12162)\n\nFix #12141",
          "timestamp": "2025-02-20T17:03:10-03:00",
          "tree_id": "dcbdd62ca1a5d2ed0437c0c3122ede00b17dff47",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/481d3beaba9fcc85743919bc640a849dad7b7b88"
        },
        "date": 1740083317230,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18367.663207000078,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16172.462602 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18882.087290000072,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16342.458376999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3954.3460969998705,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3185.5812720000004 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55105.409963,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55105408000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10648.371583999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10648374000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1814861940,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1814861940 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127991101,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127991101 ns\nthreads: 1"
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
          "id": "94d0b9b94e26bfa4b8e6069c089701f35d12aa3e",
          "message": "fix: ASSERTS that should throw (#12167)\n\nI did e2e and e2e_all in\nhttps://github.com/AztecProtocol/aztec-packages/pull/11459 and the\ndarwin builds didn't fail there, but they fail in master. This is\nbasically a typo fix.",
          "timestamp": "2025-02-20T16:27:20-05:00",
          "tree_id": "7d808a0d842fbaf37c649ddb4a3b3a14b4500ddc",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/94d0b9b94e26bfa4b8e6069c089701f35d12aa3e"
        },
        "date": 1740088629401,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18401.915873000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16234.546625 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18770.98970799989,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16358.921682999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3928.8175990000127,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3192.524564 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54918.76687400001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54918767000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10640.891133999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10640895000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1849008533,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1849008533 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128856934,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128856934 ns\nthreads: 1"
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
          "id": "06e1041f38eaf6b68c621369d95993496e445062",
          "message": "fix(ci): don't have checks go green immediately (#12168)\n\nWe can't have overlapping check names here. We have to split this out to\nits own repo. This is probably a good separation of concerns, too, to\nprevent people just leaking secrets without stopping to think.",
          "timestamp": "2025-02-20T16:52:36-05:00",
          "tree_id": "cfbcc37d1ea54e0d47d91d3f0659e6caa63025c3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/06e1041f38eaf6b68c621369d95993496e445062"
        },
        "date": 1740089083282,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17973.176707999985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15946.519593 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18615.35791,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16343.199058 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3865.1225970000382,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3108.192513 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54769.314765999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54769315000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10592.253077999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10592256000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1822248343,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1822248343 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 132696508,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 132696508 ns\nthreads: 1"
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
          "id": "7768ffe4e25cb234328be04f4fff8947f6390415",
          "message": "chore(spartan): workaround bot + transfer test conflict (#12165)\n\nUntil #12163, disable bot which interferes with the transfer test",
          "timestamp": "2025-02-20T17:28:01-05:00",
          "tree_id": "9c567e11c6385ff3566c1517d10387d536cfb033",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7768ffe4e25cb234328be04f4fff8947f6390415"
        },
        "date": 1740091205418,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18137.002772000018,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16021.873844000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18624.61639099996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16332.193616000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3855.399848999923,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3058.315564000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54917.17576,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54917174000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9772.573803,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9772579000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1820323753,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1820323753 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128813543,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128813543 ns\nthreads: 1"
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
          "id": "f7a65ee697aa7e1a2bbdfcafe9d846aadd9aa2c2",
          "message": "fix: work around matrix restriction on status checks (#12173)\n\nand the merge-check is revived",
          "timestamp": "2025-02-20T17:35:46-05:00",
          "tree_id": "b088846028592bfe2f5f94c2ee331951f5c80c97",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f7a65ee697aa7e1a2bbdfcafe9d846aadd9aa2c2"
        },
        "date": 1740091676006,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18203.68625000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16158.835127 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18498.485044999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16156.524540000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3882.771124000044,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3039.0720039999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54771.203354,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54771204000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10968.120658,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10968123000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1817594499,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1817594499 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128756795,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128756795 ns\nthreads: 1"
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
          "id": "321854c86cafeeb72b19f6b8353ebd9b56b81261",
          "message": "fix(docs): Escape $ in notes page (#12170)\n\nFixes a formatting error. Now renders properly:\n\n\n![image](https://github.com/user-attachments/assets/0925e93e-edaa-45ad-8e2b-ab650720169b)\n\nCo-authored-by: ludamad <adam.domurad@gmail.com>",
          "timestamp": "2025-02-20T19:15:11-05:00",
          "tree_id": "cc761ebbcd55522fead30be978f58c0f1cdde7cc",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/321854c86cafeeb72b19f6b8353ebd9b56b81261"
        },
        "date": 1740097602252,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18057.729859999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15900.661340999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18563.499621999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16170.933662000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3878.6432869999885,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3070.129144 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55054.548623,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55054548000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11321.878781000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11321882000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1832254534,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1832254534 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 136657595,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 136657595 ns\nthreads: 1"
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
          "distinct": true,
          "id": "ac2300e76c51b67cd76167b4f77d192ae69bb970",
          "message": "fix(p2p): prune duplicate peers (#12128)",
          "timestamp": "2025-02-21T09:37:39+08:00",
          "tree_id": "a75dd2c06a0aa552261fd6c4d8ff26d7c43d3bb9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ac2300e76c51b67cd76167b4f77d192ae69bb970"
        },
        "date": 1740103148332,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18169.9808379999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16050.749553 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18520.709226000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16278.897231000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3837.571634000142,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3162.675602 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54634.904751,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54634882000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10475.022782,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10475029000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1824924019,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1824924019 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128388381,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128388381 ns\nthreads: 1"
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
          "id": "0fb5904f18615a194cb6718365dd1b48df5b781c",
          "message": "fix: log failure to remove tmp dir (#12180)\n\nLeftover from #12162",
          "timestamp": "2025-02-21T09:57:25Z",
          "tree_id": "dff5b43d136ebd784c4faf4e56f4062cea556c2d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0fb5904f18615a194cb6718365dd1b48df5b781c"
        },
        "date": 1740133133137,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18093.536103999897,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16006.202509 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18648.805807000143,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16407.808071000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3880.7457050002085,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3057.371494000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54918.263412,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54918263000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11117.922175,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11117925000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1821500303,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1821500303 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 136959012,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 136959012 ns\nthreads: 1"
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
          "id": "e332eeb6d4d02d6b1d124ba6d6b5c62e12dd3ac8",
          "message": "chore(avm): modify interaction label processing (#12181)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this line.",
          "timestamp": "2025-02-21T10:12:21Z",
          "tree_id": "b00ef6559b8aa916c9074f8c67757ba374ac3372",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e332eeb6d4d02d6b1d124ba6d6b5c62e12dd3ac8"
        },
        "date": 1740134531490,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18387.22418200018,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16070.678356000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18760.8471850001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16284.003556000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3995.781688000079,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3182.757996 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54912.499047,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54912501000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10269.883287,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10269899000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1824968919,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1824968919 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 131162436,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 131162436 ns\nthreads: 1"
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
          "id": "e2f675f98cf887871f633db51b83ec50af6e5f83",
          "message": "fix: Fix epoch monitoring and related e2e tests (#12096)\n\nFixes the prover-node's epoch monitor so it accounts for the previous\nepoch to be proven. The updated logic is that an epoch is ready to prove\nonly if it is completed and it contains the first unproven block (which\ngets updated over a reorg).\n\nAlso fixes #11840 \n\nBuilds on top of @PhilWindle's #12014\n\n---------\n\nCo-authored-by: PhilWindle <philip.windle@gmail.com>",
          "timestamp": "2025-02-21T09:04:51-03:00",
          "tree_id": "17349e5c88f5897cbb0dda2cdd071c962ea6cd8c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e2f675f98cf887871f633db51b83ec50af6e5f83"
        },
        "date": 1740141167561,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18387.406677999934,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16216.388550000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18908.683499000064,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16445.991206 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4095.2355709998756,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3152.8012390000004 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55045.208420999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55045208000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10150.565249000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10150579000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1826167779,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1826167779 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127532963,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127532963 ns\nthreads: 1"
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
          "id": "1691e1f8da94c6fb3c37a576ce2cd2427785a530",
          "message": "chore: re-exporting deployAccountMethod (#12158)",
          "timestamp": "2025-02-21T20:54:19+08:00",
          "tree_id": "e76501ed793da9a113c236b406aadc2b9a2768fe",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1691e1f8da94c6fb3c37a576ce2cd2427785a530"
        },
        "date": 1740143935379,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18459.760411999923,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16262.616564999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18844.619160000093,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16445.207163 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4055.1084329999867,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3132.5966209999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55086.569692,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55086570000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10814.143949,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10814146000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1846177478,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1846177478 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 129553719,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 129553719 ns\nthreads: 1"
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
          "id": "ad5b3e9271a2cb4caa3e225f0e1350cf7e9f6c03",
          "message": "chore: redo typo PR by gap-editor (#12184)\n\nThanks gap-editor for\nhttps://github.com/AztecProtocol/aztec-packages/pull/12183. Our policy\nis to redo typo changes to dissuade metric farming. This is an automated\nscript.",
          "timestamp": "2025-02-21T13:59:37Z",
          "tree_id": "932c92e7e878d4101033f291106ed78a9ce52c1a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ad5b3e9271a2cb4caa3e225f0e1350cf7e9f6c03"
        },
        "date": 1740147122148,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18105.028485000046,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16027.11738 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18654.110237000055,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16283.502813000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3842.821866999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3039.6774360000004 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54477.764682,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54477765000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9578.987156000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9578988000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1830918490,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1830918490 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 130736503,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 130736503 ns\nthreads: 1"
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
          "distinct": true,
          "id": "0e26c3fffc671a854a59efeec1237d8057292573",
          "message": "chore: address extra decryption oracle pr comments (#12065)\n\nAES decryption oracle returns a BoundedVec instead of pkcs#7 padded_plaintext",
          "timestamp": "2025-02-21T14:28:16Z",
          "tree_id": "06bb99fd9fb64d730bc7e03c41d44ddb7b9a7385",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0e26c3fffc671a854a59efeec1237d8057292573"
        },
        "date": 1740149641123,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18255.25892199994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16068.111152 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18838.98814700001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16327.962819 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3990.4092330000367,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3193.7612750000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55218.725875,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55218726000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10927.798916999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10927802000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1846984573,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1846984573 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 132579143,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 132579143 ns\nthreads: 1"
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
          "id": "436def34af89eeb0529d113f3c080b7dc0c2064a",
          "message": "feat!: remove addNote, compute_note_hash_... (#12171)\n\nThis removes the `addNote` function from PXE (`addNullifiedNote` had\nbeen removed in #11822). With this change, PXE no longer needs to\nunderstand how to compute note hashes and perform nonce discovery, which\nmeans we can also get rid of all of that code, _plus_ we can delete the\nmandatory `compute_note_hash_and_optionally_a_nullifier` contract\nfunction, _plus_ all of the auxiliary code used to call those.\n\nInstead, contracts that wish to deliver notes to their recipients via\noffchain mechanisms (i.e. not the protocol logs) must create custom\nunconstrained functions that know how to construct said notes and add\nthem to PXE. For cases such as `TransparentNote`, where all of the note\ncontents are public already, this is quite simple:\n`aztec::discovery::process_private_log` can be leveraged to a great\ndegree by mimicking the log encoding aztec-nr uses - see the\nTokenBlacklist and Test contracts for examples of this. More fine\ngrained control could be achieved by calling\n`aztec::discovery::attempt_note_nonce_discovery` and then the\n`deliver_note` oracle (which is essentially what `process_private_log`\ndoes, sans the decoding).\n\nThe removal of `compute_note_hash_and_optionally_a_nullifier` freed us\nfrom some legacy burdens in having to produce the 4 field array, dealing\nwith optional nullifier computation, etc., which in turn allowed for the\ncontract library method `_compute_note_hash_and_optionally_a_nullifier`\nto be streamlined and converted into the new\n`compute_note_hash_and_nullifier`, which matches\n`aztec::discovery::ComputeNoteHashAndNullifier` and hence results in\nmuch easier use of the discovery functions.\n\nTagging @critesjosh since `addNote` was quite a basic and old primitive.\n\nCloses #11638.",
          "timestamp": "2025-02-21T15:07:20Z",
          "tree_id": "f20621b67efceeebfd123d26b933305b44aa3fca",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/436def34af89eeb0529d113f3c080b7dc0c2064a"
        },
        "date": 1740152176187,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18455.252729999986,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16179.917882999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18995.27534999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16493.72379 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3987.060364000172,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3163.2282189999996 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55050.451955,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55050452000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10795.075085,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10795081000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1844748146,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1844748146 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 134129480,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 134129480 ns\nthreads: 1"
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
          "id": "ed9a416c1d4dfb8a3a327baebdf61d5f54881355",
          "message": "feat: Sync from noir (#12176)\n\nAutomated pull of development from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nfeat: Sync from aztec-packages\n(https://github.com/noir-lang/noir/pull/7474)\nfix: don't panic when shifting too much\n(https://github.com/noir-lang/noir/pull/7429)\nchore: bump external pinned commits\n(https://github.com/noir-lang/noir/pull/7472)\nchore: remove `disable_macros` compile option\n(https://github.com/noir-lang/noir/pull/7468)\nchore(ci): add workflow to automate bumping aztec-packages commit\n(https://github.com/noir-lang/noir/pull/7465)\nchore: Release Noir(1.0.0-beta.3)\n(https://github.com/noir-lang/noir/pull/7346)\nchore(ci): Missing dash in profiler command argument\n(https://github.com/noir-lang/noir/pull/7467)\nfeat(experimental): show macro errors where they happen\n(https://github.com/noir-lang/noir/pull/7333)\nfeat: optimize FieldElement::num_bits\n(https://github.com/noir-lang/noir/pull/7147)\nchore(profiler): Docs on profiler command and more complete error\nreporting (https://github.com/noir-lang/noir/pull/7436)\nfeat(ci): Release noir-inspector in binaries\n(https://github.com/noir-lang/noir/pull/7464)\nchore(docs): Noir Profiler external documentation\n(https://github.com/noir-lang/noir/pull/7457)\nfeat(ci): Publish binaries for noir-profiler\n(https://github.com/noir-lang/noir/pull/7443)\nchore: Copy #7387 docs into v1.0.0-beta.2 versioned_docs\n(https://github.com/noir-lang/noir/pull/7458)\nfix: prevent incorrect ACIRgen caused by noop truncations\n(https://github.com/noir-lang/noir/pull/7456)\nfeat: add native `u128` type\n(https://github.com/noir-lang/noir/pull/7301)\nchore: standardize that doc comments on top of statements and expression\nare allowed but warn (https://github.com/noir-lang/noir/pull/7450)\nfix: don't let nargo fmt produce multiple trailing newlines\n(https://github.com/noir-lang/noir/pull/7444)\nEND_COMMIT_OVERRIDE\n\n---------\n\nCo-authored-by: Tom French <tom@tomfren.ch>",
          "timestamp": "2025-02-21T15:22:23Z",
          "tree_id": "461a0f7b5b34857e6943d9779e1d8e374e4a7ea8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ed9a416c1d4dfb8a3a327baebdf61d5f54881355"
        },
        "date": 1740153013716,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18407.163237000077,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16180.288506 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18789.364944999987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16380.477103000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3964.2892910001137,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3153.411128 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55048.208085,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55048208000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9626.254036,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9626255000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1837039363,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1837039363 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 129431981,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 129431981 ns\nthreads: 1"
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
          "id": "88b5878dd4b95d691b855cd84153ba884adf25f8",
          "message": "feat(avm): sha256 round read (#12032)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-02-21T15:52:29Z",
          "tree_id": "6fe56b94d2cf2aaea82ca579e5980fd2962d95bd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/88b5878dd4b95d691b855cd84153ba884adf25f8"
        },
        "date": 1740154363122,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18254.840671000013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16120.123538999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18729.343554000025,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16254.613828 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3943.7366560000555,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3114.3202209999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54873.541017999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54873544000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11184.966275,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11184968000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1813920169,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1813920169 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 131297462,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 131297462 ns\nthreads: 1"
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
          "id": "f56256e54a54ad908ebdad63468692a3c9cd295d",
          "message": "chore(spartan): flood publish configuration (#12190)",
          "timestamp": "2025-02-21T16:49:03Z",
          "tree_id": "96603f64b2944775a2300c65a7151b7b5e9045fb",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f56256e54a54ad908ebdad63468692a3c9cd295d"
        },
        "date": 1740157342531,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18246.842347999973,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16047.686651 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18614.435230000025,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16451.064237999995 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3985.754421000024,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3047.9255709999998 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54719.773719000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54719773000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9302.866187,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9302870000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1829289384,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1829289384 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 135693386,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 135693386 ns\nthreads: 1"
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
          "id": "d0013f2c68228faeac35cb5968f71dabc3d936dc",
          "message": "docs: update bb commands and fix links in readme (#12178)\n\n- Update new API names\n- Fix links to Noir docs",
          "timestamp": "2025-02-21T12:22:04-05:00",
          "tree_id": "73ee854e04beaf7479356d5f19e059db02bed769",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d0013f2c68228faeac35cb5968f71dabc3d936dc"
        },
        "date": 1740159403506,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18082.453192,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15929.382677 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18593.101707000074,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16167.689634999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3916.2995990000127,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3057.081881 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55015.49477,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55015493000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11350.669404,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11350681000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1828504828,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1828504828 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133847420,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133847420 ns\nthreads: 1"
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
          "id": "fd323cc9d3f2a1e81f3ea2bc82e36c8fcf02db93",
          "message": "fix: Revert \"feat: add wasm memory benchmark to bench.json\" (#12204)\n\nbench code didn't execute properly",
          "timestamp": "2025-02-21T17:54:21-05:00",
          "tree_id": "5e631c85d6f90315a0ac198831868364d16e60c2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fd323cc9d3f2a1e81f3ea2bc82e36c8fcf02db93"
        },
        "date": 1740179288919,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18057.75719500002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15928.698677 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18666.189926000014,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16235.844681999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3844.826229999967,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3104.21074 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54798.984343,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54798984000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11213.816013000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11213816000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1816578951,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1816578951 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128319092,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128319092 ns\nthreads: 1"
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
          "id": "68c228d3c43b072a58b2e0fd3aa5e7a696400b0c",
          "message": "fix: delete deploy hooks after they are applied (#12189)",
          "timestamp": "2025-02-21T23:29:56Z",
          "tree_id": "36bb46604b8ecbd8ae298e3bd77fa959b9cabdfa",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/68c228d3c43b072a58b2e0fd3aa5e7a696400b0c"
        },
        "date": 1740181408420,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18244.393578000087,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16058.998344 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18555.38624899998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16209.128962 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3944.531513000129,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3123.7079179999996 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55342.125301,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55342126000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10414.690582000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10414699000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1814740922,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1814740922 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 134342920,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 134342920 ns\nthreads: 1"
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
          "id": "b35a61df37a8c26b5fa8cb8b60520ea982e04a65",
          "message": "feat: add wasm memory benchmark to bench.json (redo) (#12205)\n\nReinstates #11551 with e2e-all flag to test bench running.",
          "timestamp": "2025-02-21T19:34:11-05:00",
          "tree_id": "18dd13bc16a1b679bcb70b69731f42d4b535d817",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b35a61df37a8c26b5fa8cb8b60520ea982e04a65"
        },
        "date": 1740185330636,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18058.540739000022,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15802.331154 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18571.705784999947,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16320.107383 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3851.2579190000906,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3074.8108449999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54723.253657,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54723253000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11264.470395,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11264474000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1818322940,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1818322940 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127788707,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127788707 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2249.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "17719739ab9a62c6371cf8e1cd59dd2f2d571387",
          "message": "fix: Fix broken error message link (#12187)\n\n- fixes a broken error message link\n- removes some redundant files from the docs\n- moves `mod test;` out of the code block reference for the counter\ncontract tutorial",
          "timestamp": "2025-02-22T00:55:53Z",
          "tree_id": "356f682699d42de124525a287c326f3e2f4a19e0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/17719739ab9a62c6371cf8e1cd59dd2f2d571387"
        },
        "date": 1740187341110,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18100.50350300003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16072.843147 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18812.31977699986,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16512.734104 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3949.7023240001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3120.2308179999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54857.74075800001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54857740000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11594.481318000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11594482000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1845208593,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1845208593 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140050899,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140050899 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2249.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "6df809b891ad4023b1947b0c674daabd6761b91a",
          "message": "chore: Rename output_data_type and replace output_content by flag (#12198)\n\nSome small QOL improvements suggested by @saleel",
          "timestamp": "2025-02-21T20:33:27-05:00",
          "tree_id": "f1f47b9495c0abfce0f84ef4da606b88b0a0f249",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6df809b891ad4023b1947b0c674daabd6761b91a"
        },
        "date": 1740189726206,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18292.656510999906,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16162.291377000003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18734.581273999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16440.037995 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4005.6864810001116,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3101.933337 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54982.124484,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54982123000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9896.654186,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9896658000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1823800546,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1823800546 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 130326842,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 130326842 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2249.31",
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
          "distinct": true,
          "id": "5aaa7eee2463579eafadfbbe770619866c4dfcba",
          "message": "feat: bytecode hashing (#12142)\n\n```\n------- STATS -------\nprove/execute_log_derivative_inverse_commitments_round_ms: 128\nprove/execute_log_derivative_inverse_round_ms: 337\nprove/execute_pcs_rounds_ms: 2128\nprove/execute_relation_check_rounds_ms: 8229\nprove/execute_wire_commitments_round_ms: 1321\nproving/all_ms: 13251\nproving/construct_proof_ms: 12145\nproving/init_polys_to_be_shifted_ms: 55\nproving/init_polys_unshifted_ms: 30\nproving/prove:compute_polynomials_ms: 296\nproving/prove:construct_prover_ms: 1\nproving/prove:proving_key_ms: 548\nproving/prove:verification_key_ms: 110\nproving/set_polys_shifted_ms: 0\nproving/set_polys_unshifted_ms: 209\nsimulation/all_ms: 26\ntracegen/all_ms: 2305\ntracegen/alu_ms: 0\ntracegen/bytecode_decomposition_ms: 2137\ntracegen/bytecode_hashing_ms: 26\ntracegen/bytecode_retrieval_ms: 0\ntracegen/ecc_add_ms: 0\ntracegen/execution_ms: 0\ntracegen/instruction_fetching_ms: 0\ntracegen/interactions_ms: 61\ntracegen/poseidon2_hash_ms: 3\ntracegen/poseidon2_permutation_ms: 116\ntracegen/sha256_compression_ms: 0\ntracegen/traces_ms: 2243\n\nColumn sizes per namespace:\n  precomputed: 2097152 (~2^21)\n  execution: 6 (~2^3)\n  alu: 0 (~2^0)\n  bc_decomposition: 60506 (~2^16)\n  bc_hashing: 1953 (~2^11)\n  bc_retrieval: 1 (~2^0)\n  bitwise: 0 (~2^0)\n  ecc: 0 (~2^0)\n  instr_fetching: 6 (~2^3)\n  poseidon2_hash: 1953 (~2^11)\n  poseidon2_perm: 1952 (~2^11)\n  range_check: 0 (~2^0)\n  sha256: 0 (~2^0)\n  lookup: 196608 (~2^18)\n```",
          "timestamp": "2025-02-22T16:58:07Z",
          "tree_id": "4135703c0b18dddf2f3980b5a4e0880a79089fd5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5aaa7eee2463579eafadfbbe770619866c4dfcba"
        },
        "date": 1740245032008,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18367.18967599995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16133.616360000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18724.327532999952,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16300.345942 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3923.8447400000496,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3168.463304 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54660.264289000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54660265000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10931.801844000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10931806000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1822876239,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1822876239 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133235492,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133235492 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2249.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "912f2c539bcf382e28df4afa0fc44fec89f3cd85",
          "message": "feat(p2p): gossipsub scoring adjustments + testbench",
          "timestamp": "2025-02-23T02:27:21Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/12075/commits/912f2c539bcf382e28df4afa0fc44fec89f3cd85"
        },
        "date": 1740346393405,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 22016.579100999934,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18605.236213 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18726.906290999978,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16319.063031 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4164.433076999899,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3505.4332139999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 58844.636936,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 58844637000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12702.943999000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12702947000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1915292072,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1915292072 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 159160617,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 159160617 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2249.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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