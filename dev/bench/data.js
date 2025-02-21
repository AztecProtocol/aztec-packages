window.BENCHMARK_DATA = {
  "lastUpdate": 1740133140606,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "C++ Benchmark": [
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
          "id": "a00fa0e2db7dd12493bcd50facf1983a7dcc0190",
          "message": "refactor: function macros cleanup (#12066)",
          "timestamp": "2025-02-18T20:51:25+01:00",
          "tree_id": "ca3159ebf01d1b15df0c3b74eb1e4555d3280ee7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a00fa0e2db7dd12493bcd50facf1983a7dcc0190"
        },
        "date": 1739909815508,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18310.965803999807,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16210.559495999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18747.691648,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16372.549455000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3939.0519920000315,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3130.8320360000002 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54499.423315,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54499423000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10085.854174,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10085861000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1843636525,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1843636525 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133447829,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133447829 ns\nthreads: 1"
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
          "id": "8471b544666f7849d1834b33fd6aae35fd5823d2",
          "message": "fix(spartan): eth-execution logging (#12094)",
          "timestamp": "2025-02-18T20:28:37Z",
          "tree_id": "0a48d15c5263ef0ff6011995f35dce516477a453",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8471b544666f7849d1834b33fd6aae35fd5823d2"
        },
        "date": 1739911779835,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18147.302337999918,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16053.374232999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18636.195013999895,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16139.839233 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3933.8040390000515,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3060.260157999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54545.363948000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54545362000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10646.921357999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10646929000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1813237017,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1813237017 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 131852914,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 131852914 ns\nthreads: 1"
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
          "id": "11b4150cdacaf1b18b39ebb43dd31ba215e0c04a",
          "message": "chore: Use native acvm when available on orchestrator tests (#11560)\n\nLocal tests show a 2x speedup.",
          "timestamp": "2025-02-18T20:24:58Z",
          "tree_id": "0052d787c7e6deb2f1a74f3662172f59644f13d2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/11b4150cdacaf1b18b39ebb43dd31ba215e0c04a"
        },
        "date": 1739911878868,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18111.077443999875,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16047.129973000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18589.248985999802,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16304.659044999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3882.159546000139,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3045.3229869999996 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54546.214464000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54546214000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9941.647406000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9941652000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1814332830,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1814332830 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 129008483,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 129008483 ns\nthreads: 1"
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
          "id": "f1ba0153115ed913a036d1509c861c0a96706715",
          "message": "fix: aws_handle_evict recovery & termination (#12086)\n\nThis should gracefully handle both recovering from spot evict and\nterminating in time.",
          "timestamp": "2025-02-18T20:26:55Z",
          "tree_id": "26f316b1a3b2b95a7e11f1c4c0217f1191a506e9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f1ba0153115ed913a036d1509c861c0a96706715"
        },
        "date": 1739911921281,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18042.46969299993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15778.143476 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18510.60002100007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16299.096609999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3871.3426449999133,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3053.968264 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55066.977741999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55066979000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9816.247989000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9816257000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1820944555,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1820944555 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127686960,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127686960 ns\nthreads: 1"
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
          "id": "3b8f8766670e25a23847bfdc89f5992a6a7a52ab",
          "message": "fix: dry run on grind (#12088)\n\nPrevents the docker push from failing in grind jobs where\nDOCKERHUB_PASSWORD isnt set",
          "timestamp": "2025-02-18T16:16:32-05:00",
          "tree_id": "10b59ac4aab868361bd5fcca1b3cf51e0ce13fe9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3b8f8766670e25a23847bfdc89f5992a6a7a52ab"
        },
        "date": 1739914092459,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18083.689436999975,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15869.141907 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18454.315506999934,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16325.489571999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3921.1777419999976,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3053.4491080000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54799.502454,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54799502000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12169.630596,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12169632000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1819768671,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1819768671 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 130805765,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 130805765 ns\nthreads: 1"
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
          "id": "6089220e1a35d17af7210d7a741fbbdebeb43f5d",
          "message": "chore: Fix unbound CI variable on release image bootstrap (#12095)\n\nWould fail locally with:\n```\nrelease-image/bootstrap.sh: line 12: CI: unbound variable\n```",
          "timestamp": "2025-02-18T18:04:26-05:00",
          "tree_id": "3d098e26d73996a59426bf73c68e8e742370778e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6089220e1a35d17af7210d7a741fbbdebeb43f5d"
        },
        "date": 1739920552821,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18145.811776000017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16022.009598 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18534.33325399999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16337.207755000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3919.4172620000245,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3028.003745 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54505.14349,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54505144000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11125.399980999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11125403000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1805904089,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1805904089 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 134325923,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 134325923 ns\nthreads: 1"
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
          "id": "fdd5375ab119242d8c2b92b5221a974ba2971bbb",
          "message": "feat: Sync from noir (#12064)\n\nAutomated pull of development from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nfix(performance): Remove redundant slice access check from brillig\n(https://github.com/noir-lang/noir/pull/7434)\nchore(docs): updating tutorials and other nits to beta.2\n(https://github.com/noir-lang/noir/pull/7405)\nfeat: LSP hover for integer literals\n(https://github.com/noir-lang/noir/pull/7368)\nfeat(experimental): Compile match expressions\n(https://github.com/noir-lang/noir/pull/7312)\nfeat(acir_field): Add little-endian byte serialization for FieldElement\n(https://github.com/noir-lang/noir/pull/7258)\nfeat: allow unquoting TraitConstraint in trait impl position\n(https://github.com/noir-lang/noir/pull/7395)\nfeat(brillig): Hoist shared constants across functions to the global\nspace (https://github.com/noir-lang/noir/pull/7216)\nfeat(LSP): auto-import via visible reexport\n(https://github.com/noir-lang/noir/pull/7409)\nfix(brillig): Brillig entry point analysis and function specialization\nthrough duplication (https://github.com/noir-lang/noir/pull/7277)\nchore: redo typo PR by maximevtush\n(https://github.com/noir-lang/noir/pull/7425)\nfix(ssa): Accurately mark binary ops for hoisting and check Div/Mod\nagainst induction variable lower bound\n(https://github.com/noir-lang/noir/pull/7396)\nfeat!: remove bigint from stdlib\n(https://github.com/noir-lang/noir/pull/7411)\nchore: bump aztec-packages commit\n(https://github.com/noir-lang/noir/pull/7415)\nchore: deprecate `merkle` module of stdlib\n(https://github.com/noir-lang/noir/pull/7413)\nchore(ci): lock aztec-packages commit in CI\n(https://github.com/noir-lang/noir/pull/7414)\nfeat: while statement (https://github.com/noir-lang/noir/pull/7280)\nEND_COMMIT_OVERRIDE\n\n---------\n\nCo-authored-by: Tom French <tom@tomfren.ch>",
          "timestamp": "2025-02-19T00:55:07Z",
          "tree_id": "b97217f596789ddb0c411047afab42220b853ec9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fdd5375ab119242d8c2b92b5221a974ba2971bbb"
        },
        "date": 1739927775275,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18124.83007700007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15931.134508000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18500.84232600011,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16319.078590000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3849.1388150000603,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3065.4122649999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55014.558018,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55014556000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9574.882513,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9574890000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1795194498,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1795194498 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128576818,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128576818 ns\nthreads: 1"
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
          "id": "a86b797d059502fbd402550492f9ad13bd4ede1c",
          "message": "feat: IVC gates command in WASM (#11792)\n\nAdded the `gates()` command to the `AztecClientBackend`. It outputs an\narray of sizes of the client circuits being folded during the IVC. Also,\nslightly extended wasm client ivc integration test to demonstrate this\nfunctionality.\n\n---------\n\nCo-authored-by: iakovenkos <sergey.s.yakovenko@gmail.com>\nCo-authored-by: thunkar <gregojquiros@gmail.com>\nCo-authored-by: sergei iakovenko <105737703+iakovenkos@users.noreply.github.com>",
          "timestamp": "2025-02-19T12:15:12+01:00",
          "tree_id": "38527c20cc9b62f6efb12842e228afeb8858f5e4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a86b797d059502fbd402550492f9ad13bd4ede1c"
        },
        "date": 1739965431016,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18258.754501999872,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16070.852406 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18800.292337999963,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16260.287520000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3907.935529000042,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3105.6485729999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55208.66538499999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55208663000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11243.639180999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11243644000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1846749942,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1846749942 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 134918550,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 134918550 ns\nthreads: 1"
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
          "id": "342ff474164d042d1eebf067d5edc292d78c1162",
          "message": "fix(avm): break TS dependency cycle (#12103)",
          "timestamp": "2025-02-19T07:23:12-05:00",
          "tree_id": "c532a6d388cb46bd386244d6150187629f17e054",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/342ff474164d042d1eebf067d5edc292d78c1162"
        },
        "date": 1739969306183,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18225.839811000013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16015.595068 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18762.506200999953,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16300.789272 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3955.9854460001134,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3156.969495 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54835.114333,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54835113000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12876.520779,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12876526000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1807726902,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1807726902 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 130329855,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 130329855 ns\nthreads: 1"
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
          "id": "9dac0c6227a8b19b335e0b2812946273a9580a78",
          "message": "chore: Provide defaults for bb and acvm in release image (#12105)\n\nThis PR attempts to fix deployments by re-instating defaults env vars\nfor bb and acvm in yarn project.",
          "timestamp": "2025-02-19T12:41:18Z",
          "tree_id": "dd3ec41b0f1fbc35ad4d6a8aae58de868f90f03b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9dac0c6227a8b19b335e0b2812946273a9580a78"
        },
        "date": 1739969556062,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17934.122342000024,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15866.812563000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18516.76063599996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16392.960636 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3832.938817000013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3095.571844 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55038.778769,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55038776000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11039.586822,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11039588000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1806512226,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1806512226 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128597189,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128597189 ns\nthreads: 1"
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
          "id": "e3bc1a5401bc16876706cee019a73b441ee98afa",
          "message": "fix: Use gas billed in block header building (#12101)\n\nFixes https://github.com/AztecProtocol/aztec-packages/issues/12089",
          "timestamp": "2025-02-19T15:15:39+01:00",
          "tree_id": "71d5ad78761ec4b1731d4d4896feaccd76020caa",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e3bc1a5401bc16876706cee019a73b441ee98afa"
        },
        "date": 1739976167822,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18232.54027899998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16147.084724999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18776.526205999973,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16321.302573 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3989.462730000014,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3142.032781 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54911.461774999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54911460000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10867.966644999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10867969000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1829487357,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1829487357 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 131622903,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 131622903 ns\nthreads: 1"
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
          "id": "6fd8b49d7bdda4995ec6b017964878faab0e905e",
          "message": "fix: Don't consider skipping (#10598)\n\nThe relation accumulation method\n`accumulate_relation_evaluations_without_skipping` used by the verifier\nhas been erroneously allowing the verifier to use the skip mechanism via\n`/*consider_skipping=*/true`.\n\nFixing this uncovered an issue with the `EccOpQueueRelation` skip\ncondition which has been resolved.\n\n---------\n\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>\nCo-authored-by: iakovenkos <sergey.s.yakovenko@gmail.com>\nCo-authored-by: sergei iakovenko <105737703+iakovenkos@users.noreply.github.com>",
          "timestamp": "2025-02-19T16:07:08+01:00",
          "tree_id": "efcc4350a872b1e5f60374e267cd73a840ed1a7e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6fd8b49d7bdda4995ec6b017964878faab0e905e"
        },
        "date": 1739979189223,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18403.262648999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16124.557427 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18563.016007999977,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16326.078087999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3954.467732000012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3100.9277029999994 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54703.377405,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54703377000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9883.794893999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9883799000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1839515914,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1839515914 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 130210216,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 130210216 ns\nthreads: 1"
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
          "id": "fc9f1c42128140b7bef794e7ae494fd1566cdb73",
          "message": "chore: fix error in oracle definition (#12090)\n\nThis is breaking a compiler check that we're wanting to promote to an\nerror.",
          "timestamp": "2025-02-19T15:41:54Z",
          "tree_id": "bbc14758038651a9759873f21d9cace227af3db1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fc9f1c42128140b7bef794e7ae494fd1566cdb73"
        },
        "date": 1739981248812,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18479.34057400016,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16180.573521999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18777.162584000052,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16186.855306000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3940.244743000221,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3154.769091 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55020.636714,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55020636000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10007.225221,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10007231000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1837606682,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1837606682 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 130570026,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 130570026 ns\nthreads: 1"
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
          "id": "1350f93c3e9af8f601ca67ca3e67d0127c9767b6",
          "message": "chore: add missing import (#12111)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-02-19T17:21:04Z",
          "tree_id": "258dfbd546da68259669d69a9f5f7d220b85df8d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1350f93c3e9af8f601ca67ca3e67d0127c9767b6"
        },
        "date": 1739987341050,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18294.7873359999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16127.827432 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18805.42209999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16675.233359 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3957.094420999965,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3169.589568 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54806.045157,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54806045000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9721.771579,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9721781000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1813054280,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1813054280 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 132763881,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 132763881 ns\nthreads: 1"
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
          "id": "aaf0ae019e8094ce099c7b6d58f60df5300452b7",
          "message": "fix: darwin properly erroring (#12113)",
          "timestamp": "2025-02-19T17:33:41Z",
          "tree_id": "c2ae83a09fa0ef68de9f261d99b8b7e73f384e35",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/aaf0ae019e8094ce099c7b6d58f60df5300452b7"
        },
        "date": 1739988133577,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18357.94461699993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16168.350319999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18742.94784699987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16528.042472999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3941.1189809998177,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3116.9530279999994 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55091.715113,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55091715000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9947.789273,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9947796000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1812158662,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1812158662 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125864719,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125864719 ns\nthreads: 1"
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
          "id": "13ad91cb03daafd43e0ba0bd5a4713b6251cf215",
          "message": "chore(p2p): log if rate limit was peer or global (#12116)",
          "timestamp": "2025-02-19T18:48:21Z",
          "tree_id": "640f3ede577cf788639cfb1328f7302407669d3c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/13ad91cb03daafd43e0ba0bd5a4713b6251cf215"
        },
        "date": 1739992406961,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18161.95603799997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16094.523198999997 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18840.565708999973,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16383.044138000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3950.790959999722,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3143.18125 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55035.80749,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55035804000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11001.773645,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11001776000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1845542769,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1845542769 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133996134,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133996134 ns\nthreads: 1"
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
          "id": "1e4ad1c93a2f0dee4796542d6ca0f1e6ec2f13af",
          "message": "chore: @aztec/stdlib pt1 -> cleanup circuits js (#12039)\n\nThis initial PR focuses on:\n\n- Moving generic stuff from `circuits.js` to `foundation`: merkle tree\ncalculator is general enough to be on foundation, same with crypto\nfunctions.\n- Extracting references to blobs from `circuits.js` so they're not\naccidentally imported into browser bundles again. Still work to do here,\nthis will only be completely realized once the \"catchall\" export is\nremoved.\n- Extracting `constants` to its own package to deal with circular\nreferences -> `blob-lib` and `circuits.js` need them, this opens the\ndoor to cleaner and more advanced anti \"I forgot to update constants\"\nmeasures.\n- Prepare `foundation` and `circuits.js` so aztec-specific code is moved\nfrom the former to the latter (will be done in a new PR, specifically\ntargetting aztec-address, abi already moved).\n- Preparing `circuits.js` for a reorg, specifically targeting the\nremoval of the \"catchall\" export and moving to granular approach. This\nwill end with the renaming of `circuits.js` to `stdlib`.\n- Preparing for the removal of a lot of reexports. They will be kept to\na minimum, with the exception of outwards-facing APIs such as `aztec.js`",
          "timestamp": "2025-02-19T19:42:35+01:00",
          "tree_id": "9352cd261229d6a67655be64cb69b07ef2d75028",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1e4ad1c93a2f0dee4796542d6ca0f1e6ec2f13af"
        },
        "date": 1739992466383,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18363.999492999938,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16241.730371 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18827.25016900008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16349.914595999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3902.087054999811,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3104.890923 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54899.189947000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54899190000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9695.749147,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9695753000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1816245044,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1816245044 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 129832651,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 129832651 ns\nthreads: 1"
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
      }
    ]
  }
}