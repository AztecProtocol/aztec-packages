window.BENCHMARK_DATA = {
  "lastUpdate": 1731419481741,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "C++ Benchmark": [
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
          "id": "3351217a7e7f1848c43e14d19427e1cd789c78fc",
          "message": "fix: revert \"feat: sol shplemini in acir tests + contract_gen\" (#9505)\n\nReverts AztecProtocol/aztec-packages#8874\r\n\r\nSeems to break the prover e2e, i cannot reproduce locally rn.",
          "timestamp": "2024-10-29T10:36:20Z",
          "tree_id": "83482401c6321e5e1b8f8c6228896f53fa20f2ee",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3351217a7e7f1848c43e14d19427e1cd789c78fc"
        },
        "date": 1730202573358,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30977.778160999977,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29478.607825 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5449.805523999984,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5062.474743 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91872.966094,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91872968000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15214.672032,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15214673000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2708818197,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2708818197 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126782918,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126782918 ns\nthreads: 1"
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
          "id": "0fe64dfabe6b4413943204ec17a5d0dca3c2d011",
          "message": "fix(avm): re-enable sha256 in bulk test, fix bug in AVM SHL/SHR (#9496)\n\nReverts AztecProtocol/aztec-packages#9482",
          "timestamp": "2024-10-29T11:31:46Z",
          "tree_id": "0321d157249aa227efa6a264398299d4965078e5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0fe64dfabe6b4413943204ec17a5d0dca3c2d011"
        },
        "date": 1730203134976,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31009.145664000018,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29276.36729 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5417.303787999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5041.500788 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 93704.152491,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 93704155000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15233.801043000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15233800000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2741048070,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2741048070 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 129529235,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 129529235 ns\nthreads: 1"
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
          "id": "bc9828e03ba0924c2cfdaffb4b7455c8eebf01e9",
          "message": "test: use big endian in sha  (#9471)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\r\nline.\r\n\r\n---------\r\n\r\nCo-authored-by: dbanks12 <david@aztecprotocol.com>\r\nCo-authored-by: David Banks <47112877+dbanks12@users.noreply.github.com>",
          "timestamp": "2024-10-29T08:02:10-04:00",
          "tree_id": "03a10da0621bde861d5d4d0c4505632a5e0004f9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/bc9828e03ba0924c2cfdaffb4b7455c8eebf01e9"
        },
        "date": 1730205575584,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30912.58440300001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29276.702808 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5365.898195,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5017.569630999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91530.44902100001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91530451000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15167.330012999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15167330000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2698848147,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2698848147 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126757929,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126757929 ns\nthreads: 1"
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
          "id": "8f710068a10e09fad9c159306c19c555bb3b5bb6",
          "message": "feat(avm)!: returndatasize + returndatacopy (#9475)\n\nThis PR\n* Introduces RETURNDATASIZE and RETURNDATACOPY (also copies revert data if reverted)\n* Fixes a bug in CALL in witgen\n* Changes the public context to return slices when calling public functions. This was partly done because templated functions would always be inlined and I wanted to avoid that blowup\n\nNote that the rethrowing hack is still present in the simulator, so the rethrowing branch in the public context is still not used. I will make this change once @sirasistant finishes the string encoding changes.\n\nIn a later PR we can remove the returndata from CALL.\n\nPart of #9061.",
          "timestamp": "2024-10-29T17:01:39Z",
          "tree_id": "9f9846d0222e5df93ed550c21885ea9804ef68fe",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8f710068a10e09fad9c159306c19c555bb3b5bb6"
        },
        "date": 1730222912212,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30950.335728,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29371.197408 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5397.899536000012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5075.965949999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91805.27016700001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91805272000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15174.790125999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15174790000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2712315314,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2712315314 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126647434,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126647434 ns\nthreads: 1"
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
          "id": "468c100558f181408ad59b528ad4e43aaa7e7f3a",
          "message": "fix: honk shplemini acir artifacts (#9550)\n\nReverts AztecProtocol/aztec-packages#9505",
          "timestamp": "2024-10-29T17:05:57Z",
          "tree_id": "c55f49a97ae6f1acfdaf9bcbe7f719976093a478",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/468c100558f181408ad59b528ad4e43aaa7e7f3a"
        },
        "date": 1730224036380,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30946.971482999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29203.644255 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5341.377541,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4998.010596999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92943.086677,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92943089000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15250.972099,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15250972000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2694299760,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2694299760 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126126358,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126126358 ns\nthreads: 1"
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
          "id": "26adc55771a204f96e8594f6defde2a4872c88d2",
          "message": "feat(avm)!: cleanup CALL (#9551)\n\n* (Static)CALL now returns just the success bit\n* Properly returns U1 instead of U8\n* Removed FunctionSelector\n\nFixes #8998. Part of #9061.",
          "timestamp": "2024-10-29T17:57:21Z",
          "tree_id": "1fba5264a5faefaa4166f84df6ded362598266a8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/26adc55771a204f96e8594f6defde2a4872c88d2"
        },
        "date": 1730227064645,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30850.779605000014,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29019.381799 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5349.200418000009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5004.156865999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92386.64418,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92386646000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15173.086461,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15173086000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2704267986,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2704267986 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127341546,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127341546 ns\nthreads: 1"
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
          "id": "a4bd3e14f6cde05f4d59bc48142e9ef4bc78f0ae",
          "message": "feat: 20-30% cost reduction in recursive ipa algorithm (#9420)\n\neccvm_recursive_verifier_test measurements (size-512 eccvm recursive\r\nverification)\r\n\r\nOld: 876,214\r\nNew: 678,751\r\n\r\nThe relative performance delta should be much greater for large eccvm\r\ninstances as this PR removes an nlogn algorithm.\r\n\r\nThis PR resolves issue\r\n[#857](https://github.com/AztecProtocol/barretenberg/issues/857) and\r\nissue [#1023](https://github.com/AztecProtocol/barretenberg/issues/1023)\r\n(single batch mul in IPA)\r\n\r\nRe: [#1023](https://github.com/AztecProtocol/barretenberg/issues/1023).\r\nThe code still performs 2 batch muls, but all additional * operator\r\ncalls have been combined into the batch muls.\r\n\r\nIt is not worth combining both batch muls, as it would require a\r\nmultiplication operation on a large number of scalar multipliers. In the\r\nrecursive setting the scalars are bigfield elements - the extra\r\nbigfield::operator* cost is not worth combining both batch_mul calls.\r\n\r\nAdditional improvements:\r\n\r\nremoved unneccessary uses of `pow` operator in ipa - in the recursive\r\nsetting these were stdlib::bigfield::pow calls and very expensive\r\n\r\nremoved the number of distinct multiplication calls in\r\nipa::reduce_verify_internal\r\n\r\ncycle_scalar::cycle_scalar(stdlib::bigfield) constructor now more\r\noptimally constructs a cycle_scalar out of a bigfield element. New\r\nmethod leverages the fact that `scalar.lo` and `scalar.hi` are\r\nimplicitly range-constrained to remove reundant bigfield constructor\r\ncalls and arithmetic calls, and the process of performing a scalar\r\nmultiplication applies a modular reduction to the imput, which makes the\r\nexplicit call to `validate_scalar_is_in_field` unneccessary\r\n\r\n---------\r\nCo-authored-by: lucasxia01 <lucasxia01@gmail.com>",
          "timestamp": "2024-10-29T19:33:43Z",
          "tree_id": "5bfa9fcb50af6a23b007b7468c9bddb518c11ac9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a4bd3e14f6cde05f4d59bc48142e9ef4bc78f0ae"
        },
        "date": 1730232804114,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30870.16600800001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29020.958751000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5343.219687000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4971.285772 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92672.39028,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92672392000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15116.009784999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15116010000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2712001183,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2712001183 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126471477,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126471477 ns\nthreads: 1"
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
          "id": "10874f402c48c0721491f0db8bc0266653193d9b",
          "message": "feat: reorder blocks for efficiency (#9560)\n\nReorders blocks (Mega only) so that data bus reads are close to the top\r\nof the trace and lookups are at the bottom. This helps minimize both the\r\nmemory required to store the log-deriv inverse polynomials as well as\r\nthe \"active\" region of the trace by minimizing the distance (maximizing\r\nthe overlap) of the various lookup gates with the data from which they\r\nread. (Note: tables are constructed at the bottom of the trace).",
          "timestamp": "2024-10-29T15:16:31-07:00",
          "tree_id": "dd55b09c26fe5ba1cdec96dbadeb75b468fad307",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/10874f402c48c0721491f0db8bc0266653193d9b"
        },
        "date": 1730242391172,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30572.905143000015,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28699.815508 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5352.307101000022,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5051.848772 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91708.771418,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91708773000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15118.753338999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15118753000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2664636702,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2664636702 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126149529,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126149529 ns\nthreads: 1"
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
          "id": "0da8757413e3c4fbe84ffebb6ece518c4ea203ed",
          "message": "chore(master): Release 0.61.0",
          "timestamp": "2024-10-30T12:19:08Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/9414/commits/0da8757413e3c4fbe84ffebb6ece518c4ea203ed"
        },
        "date": 1730291834749,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30544.335655000024,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28465.549108 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5347.279317999991,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5036.7202879999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 90779.498035,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 90779500000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15148.100232,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15148102000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2677340961,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2677340961 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127262415,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127262415 ns\nthreads: 1"
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
          "id": "d9de430e4a01d6908a9b1fe5e6ede9309aa8a10d",
          "message": "chore(master): Release 0.61.0 (#9414)\n\n:robot: I have created a release *beep* *boop*\r\n---\r\n\r\n\r\n<details><summary>aztec-package: 0.61.0</summary>\r\n\r\n##\r\n[0.61.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.60.0...aztec-package-v0.61.0)\r\n(2024-10-30)\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **aztec-package:** Synchronize aztec-packages versions\r\n</details>\r\n\r\n<details><summary>barretenberg.js: 0.61.0</summary>\r\n\r\n##\r\n[0.61.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.60.0...barretenberg.js-v0.61.0)\r\n(2024-10-30)\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **barretenberg.js:** Synchronize aztec-packages versions\r\n</details>\r\n\r\n<details><summary>aztec-packages: 0.61.0</summary>\r\n\r\n##\r\n[0.61.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.60.0...aztec-packages-v0.61.0)\r\n(2024-10-30)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* **avm:** cleanup CALL\r\n([#9551](https://github.com/AztecProtocol/aztec-packages/issues/9551))\r\n* **avm:** returndatasize + returndatacopy\r\n([#9475](https://github.com/AztecProtocol/aztec-packages/issues/9475))\r\n* use Brillig opcode when possible for less-than operations on fields\r\n([#9416](https://github.com/AztecProtocol/aztec-packages/issues/9416))\r\n* **profiler:** New flamegraph command that profiles the opcodes\r\nexecuted (https://github.com/noir-lang/noir/pull/6327)\r\n* split base rollup and remove public kernel proving\r\n([#9434](https://github.com/AztecProtocol/aztec-packages/issues/9434))\r\n* getcontractinstance instruction returns only a specified member\r\n([#9300](https://github.com/AztecProtocol/aztec-packages/issues/9300))\r\n* **avm/brillig:** revert/rethrow oracle\r\n([#9408](https://github.com/AztecProtocol/aztec-packages/issues/9408))\r\n\r\n### Features\r\n\r\n* `bytes_to_fields` requiring only 1 generic param\r\n([#9417](https://github.com/AztecProtocol/aztec-packages/issues/9417))\r\n([2217da6](https://github.com/AztecProtocol/aztec-packages/commit/2217da6b46cc98a2c671b270e46d91ddfbc8d812))\r\n* 20-30% cost reduction in recursive ipa algorithm\r\n([#9420](https://github.com/AztecProtocol/aztec-packages/issues/9420))\r\n([a4bd3e1](https://github.com/AztecProtocol/aztec-packages/commit/a4bd3e14f6cde05f4d59bc48142e9ef4bc78f0ae))\r\n* Add capacities to brillig vectors and use them in slice ops\r\n(https://github.com/noir-lang/noir/pull/6332)\r\n([b82f3d1](https://github.com/AztecProtocol/aztec-packages/commit/b82f3d1109a7c15517e9da8613fa90a4699cad83))\r\n* Added indexes and a way to store/retrieve tagged secrets\r\n([#9468](https://github.com/AztecProtocol/aztec-packages/issues/9468))\r\n([1c685b1](https://github.com/AztecProtocol/aztec-packages/commit/1c685b1dd3e7749e6f4570773ecc64ab245d8a0b))\r\n* **avm/brillig:** Revert/rethrow oracle\r\n([#9408](https://github.com/AztecProtocol/aztec-packages/issues/9408))\r\n([1bbd724](https://github.com/AztecProtocol/aztec-packages/commit/1bbd724eab39c193c1db1d89570eab9358563fe2))\r\n* **avm:** Avm replace zeromorph pcs by shplemini\r\n([#9389](https://github.com/AztecProtocol/aztec-packages/issues/9389))\r\n([07d6dc2](https://github.com/AztecProtocol/aztec-packages/commit/07d6dc29db2eb04154b8f0c66bd1efa74c0e8b9d))\r\n* **avm:** Cleanup CALL\r\n([#9551](https://github.com/AztecProtocol/aztec-packages/issues/9551))\r\n([26adc55](https://github.com/AztecProtocol/aztec-packages/commit/26adc55771a204f96e8594f6defde2a4872c88d2))\r\n* **avm:** Merkle tree gadget\r\n([#9205](https://github.com/AztecProtocol/aztec-packages/issues/9205))\r\n([d52b616](https://github.com/AztecProtocol/aztec-packages/commit/d52b616a91224c25f24a00b76b984f059c103dcb))\r\n* **avm:** Returndatasize + returndatacopy\r\n([#9475](https://github.com/AztecProtocol/aztec-packages/issues/9475))\r\n([8f71006](https://github.com/AztecProtocol/aztec-packages/commit/8f710068a10e09fad9c159306c19c555bb3b5bb6))\r\n* **avm:** Trace contract class and contract instance\r\n([#8840](https://github.com/AztecProtocol/aztec-packages/issues/8840))\r\n([84205d8](https://github.com/AztecProtocol/aztec-packages/commit/84205d872067345239913914a84b708d05d8364c))\r\n* Better LSP hover for functions\r\n(https://github.com/noir-lang/noir/pull/6376)\r\n([b82f3d1](https://github.com/AztecProtocol/aztec-packages/commit/b82f3d1109a7c15517e9da8613fa90a4699cad83))\r\n* Bytecode hashing init\r\n([#8535](https://github.com/AztecProtocol/aztec-packages/issues/8535))\r\n([2bb09e5](https://github.com/AztecProtocol/aztec-packages/commit/2bb09e59f648e6182f1097d283451afd3c488d27))\r\n* Check trait where clause (https://github.com/noir-lang/noir/pull/6325)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* Comptime deriving generators in macros\r\n([#9195](https://github.com/AztecProtocol/aztec-packages/issues/9195))\r\n([c4b629c](https://github.com/AztecProtocol/aztec-packages/commit/c4b629c446eb7d8043d1eaa3eb57ff788268fc2a))\r\n* Derive address and class id in avm\r\n([#8897](https://github.com/AztecProtocol/aztec-packages/issues/8897))\r\n([2ebe361](https://github.com/AztecProtocol/aztec-packages/commit/2ebe3611ad3826443b31e5626a4e08cdd90f0f2a))\r\n* Do not increment reference counts on arrays through references\r\n(https://github.com/noir-lang/noir/pull/6375)\r\n([f386612](https://github.com/AztecProtocol/aztec-packages/commit/f3866129d467da23224865232a67f6ca20c21151))\r\n* **docs:** Function transforms (hidden macros)\r\n([#7784](https://github.com/AztecProtocol/aztec-packages/issues/7784))\r\n([831cc66](https://github.com/AztecProtocol/aztec-packages/commit/831cc66bab9dd8063caac2ecc4022192a5460e13))\r\n* Fee pricing to 0 for old instances\r\n([#9296](https://github.com/AztecProtocol/aztec-packages/issues/9296))\r\n([7bc3a21](https://github.com/AztecProtocol/aztec-packages/commit/7bc3a2136a2d9b1818434a86ace28a05bba32efc))\r\n* Fixed number of pub inputs for databus commitment propagation\r\n([#9336](https://github.com/AztecProtocol/aztec-packages/issues/9336))\r\n([8658abd](https://github.com/AztecProtocol/aztec-packages/commit/8658abd46612d3fdf8c8b54902c201c790a52345))\r\n* Getcontractinstance instruction returns only a specified member\r\n([#9300](https://github.com/AztecProtocol/aztec-packages/issues/9300))\r\n([29b692f](https://github.com/AztecProtocol/aztec-packages/commit/29b692f9e81e1ee809e37274cf6ac2ab0ca526ce))\r\n* Implement encryption to an address point and decryption from an\r\naddress secret\r\n([#9272](https://github.com/AztecProtocol/aztec-packages/issues/9272))\r\n([6d77dd0](https://github.com/AztecProtocol/aztec-packages/commit/6d77dd0000c66659dbcde3930fb052605ba6af05))\r\n* Initial block reward + external libraries\r\n([#9297](https://github.com/AztecProtocol/aztec-packages/issues/9297))\r\n([240e9b5](https://github.com/AztecProtocol/aztec-packages/commit/240e9b562ef18d9b98ccc407ac95ec92f5a9bd58))\r\n* Let LSP suggest traits in trait bounds\r\n(https://github.com/noir-lang/noir/pull/6370)\r\n([f386612](https://github.com/AztecProtocol/aztec-packages/commit/f3866129d467da23224865232a67f6ca20c21151))\r\n* Let the formatter remove lambda block braces for single-statement\r\nblocks (https://github.com/noir-lang/noir/pull/6335)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* Let the LSP import code action insert into existing use statements\r\n(https://github.com/noir-lang/noir/pull/6358)\r\n([f386612](https://github.com/AztecProtocol/aztec-packages/commit/f3866129d467da23224865232a67f6ca20c21151))\r\n* Let the LSP import code action insert into existing use statements\r\n(https://github.com/noir-lang/noir/pull/6358)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* LSP auto-import will try to add to existing use statements\r\n(https://github.com/noir-lang/noir/pull/6354)\r\n([f386612](https://github.com/AztecProtocol/aztec-packages/commit/f3866129d467da23224865232a67f6ca20c21151))\r\n* LSP auto-import will try to add to existing use statements\r\n(https://github.com/noir-lang/noir/pull/6354)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* Merge and sort imports (https://github.com/noir-lang/noir/pull/6322)\r\n([b4db379](https://github.com/AztecProtocol/aztec-packages/commit/b4db37908d452ca86399baded392d5e3e86c7bc8))\r\n* Note tagging oracle\r\n([#9429](https://github.com/AztecProtocol/aztec-packages/issues/9429))\r\n([cec6306](https://github.com/AztecProtocol/aztec-packages/commit/cec63061cf8daa6d83b2634d74da8cc473598994))\r\n* Ownable sysstia\r\n([#9398](https://github.com/AztecProtocol/aztec-packages/issues/9398))\r\n([30314ec](https://github.com/AztecProtocol/aztec-packages/commit/30314ecc5148262a4af3a5ac1cee3bb7403bc806)),\r\ncloses\r\n[#9351](https://github.com/AztecProtocol/aztec-packages/issues/9351)\r\n* **perf:** Use [u32;16] for message block in sha256\r\n(https://github.com/noir-lang/noir/pull/6324)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* Print finalized size and log dyadic size during Ultra proof\r\nconstruction\r\n([#9411](https://github.com/AztecProtocol/aztec-packages/issues/9411))\r\n([84fdc52](https://github.com/AztecProtocol/aztec-packages/commit/84fdc526f73027a3450bcdcc78b826fc9da8df88))\r\n* **profiler:** New flamegraph command that profiles the opcodes\r\nexecuted (https://github.com/noir-lang/noir/pull/6327)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* Prover coordination test with a reorg\r\n([#9405](https://github.com/AztecProtocol/aztec-packages/issues/9405))\r\n([9efe288](https://github.com/AztecProtocol/aztec-packages/commit/9efe288cae945cec1e025fd7cd0bde220aff4b8d))\r\n* **prover:** Perform prover coordination via p2p layer\r\n([#9325](https://github.com/AztecProtocol/aztec-packages/issues/9325))\r\n([2132bc2](https://github.com/AztecProtocol/aztec-packages/commit/2132bc254ef3dbeaec27be98acb85a98b20385bb)),\r\ncloses\r\n[#9264](https://github.com/AztecProtocol/aztec-packages/issues/9264)\r\n* Reject programs with unconditional recursion\r\n(https://github.com/noir-lang/noir/pull/6292)\r\n([b4db379](https://github.com/AztecProtocol/aztec-packages/commit/b4db37908d452ca86399baded392d5e3e86c7bc8))\r\n* Remove 'single use' intermediate variables\r\n(https://github.com/noir-lang/noir/pull/6268)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* Reorder blocks for efficiency\r\n([#9560](https://github.com/AztecProtocol/aztec-packages/issues/9560))\r\n([10874f4](https://github.com/AztecProtocol/aztec-packages/commit/10874f402c48c0721491f0db8bc0266653193d9b))\r\n* Simulate latency with network chaos\r\n([#9469](https://github.com/AztecProtocol/aztec-packages/issues/9469))\r\n([10aefbb](https://github.com/AztecProtocol/aztec-packages/commit/10aefbbfe9f741c197900fffe2858127f1dafad8))\r\n* Sol shplemini in acir tests + contract_gen\r\n([#8874](https://github.com/AztecProtocol/aztec-packages/issues/8874))\r\n([1c0275d](https://github.com/AztecProtocol/aztec-packages/commit/1c0275db18510fd7d55b400e4a910447859f4acc))\r\n* Suggest removing `!` from macro call that doesn't return Quoted\r\n(https://github.com/noir-lang/noir/pull/6384)\r\n([b82f3d1](https://github.com/AztecProtocol/aztec-packages/commit/b82f3d1109a7c15517e9da8613fa90a4699cad83))\r\n* Support specifying generics on a struct when calling an associated\r\nfunction (https://github.com/noir-lang/noir/pull/6306)\r\n([b82f3d1](https://github.com/AztecProtocol/aztec-packages/commit/b82f3d1109a7c15517e9da8613fa90a4699cad83))\r\n* Sync from aztec-packages (https://github.com/noir-lang/noir/pull/6345)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* Tally AVM opcodes executed in simulator\r\n([#9473](https://github.com/AztecProtocol/aztec-packages/issues/9473))\r\n([9a06ada](https://github.com/AztecProtocol/aztec-packages/commit/9a06ada30c936cf5e7d10af49abe4b7274667ee2))\r\n* **test:** Run test matrix on stdlib tests\r\n(https://github.com/noir-lang/noir/pull/6352)\r\n([f386612](https://github.com/AztecProtocol/aztec-packages/commit/f3866129d467da23224865232a67f6ca20c21151))\r\n* **test:** Run test matrix on stdlib tests\r\n(https://github.com/noir-lang/noir/pull/6352)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* (formatter) correctly format quote delimiters\r\n(https://github.com/noir-lang/noir/pull/6377)\r\n([b82f3d1](https://github.com/AztecProtocol/aztec-packages/commit/b82f3d1109a7c15517e9da8613fa90a4699cad83))\r\n* (formatter) indent after infix lhs\r\n(https://github.com/noir-lang/noir/pull/6331)\r\n([b4db379](https://github.com/AztecProtocol/aztec-packages/commit/b4db37908d452ca86399baded392d5e3e86c7bc8))\r\n* (LSP) check visibility of module that re-exports item, if any\r\n(https://github.com/noir-lang/noir/pull/6371)\r\n([f386612](https://github.com/AztecProtocol/aztec-packages/commit/f3866129d467da23224865232a67f6ca20c21151))\r\n* Add native verification test to honk keccak\r\n([#9501](https://github.com/AztecProtocol/aztec-packages/issues/9501))\r\n([59810e0](https://github.com/AztecProtocol/aztec-packages/commit/59810e070e57fa8e250928608b39c66eaae39a84))\r\n* Allow globals in format strings\r\n(https://github.com/noir-lang/noir/pull/6382)\r\n([b82f3d1](https://github.com/AztecProtocol/aztec-packages/commit/b82f3d1109a7c15517e9da8613fa90a4699cad83))\r\n* Allow more resources for 4epochs tests\r\n([#9418](https://github.com/AztecProtocol/aztec-packages/issues/9418))\r\n([74a8ad1](https://github.com/AztecProtocol/aztec-packages/commit/74a8ad196988dd1d880b6510c7947ee27e5f4abb))\r\n* Allow type aliases in let patterns\r\n(https://github.com/noir-lang/noir/pull/6356)\r\n([f386612](https://github.com/AztecProtocol/aztec-packages/commit/f3866129d467da23224865232a67f6ca20c21151))\r\n* Allow type aliases in let patterns\r\n(https://github.com/noir-lang/noir/pull/6356)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* Always inline `derive_generators`\r\n(https://github.com/noir-lang/noir/pull/6350)\r\n([f386612](https://github.com/AztecProtocol/aztec-packages/commit/f3866129d467da23224865232a67f6ca20c21151))\r\n* Always inline `derive_generators`\r\n(https://github.com/noir-lang/noir/pull/6350)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* **avm:** Address bytecode hashing comments\r\n([#9436](https://github.com/AztecProtocol/aztec-packages/issues/9436))\r\n([a85f92a](https://github.com/AztecProtocol/aztec-packages/commit/a85f92a24f4ec988a4d472651a0e2827bf9381b2))\r\n* **avm:** Disable sha256 in bulk test until we debug it\r\n([#9482](https://github.com/AztecProtocol/aztec-packages/issues/9482))\r\n([078c318](https://github.com/AztecProtocol/aztec-packages/commit/078c318f9671566500c472553d88990076a8c32a))\r\n* **avm:** Re-enable sha256 in bulk test, fix bug in AVM SHL/SHR\r\n([#9496](https://github.com/AztecProtocol/aztec-packages/issues/9496))\r\n([0fe64df](https://github.com/AztecProtocol/aztec-packages/commit/0fe64dfabe6b4413943204ec17a5d0dca3c2d011))\r\n* Bb-only-change fix e2e build instability\r\n([#9441](https://github.com/AztecProtocol/aztec-packages/issues/9441))\r\n([ca3abaa](https://github.com/AztecProtocol/aztec-packages/commit/ca3abaa572395db3d1f3ed21493ae017d4ca13eb))\r\n* Better formatting of leading/trailing line/block comments in\r\nexpression lists (https://github.com/noir-lang/noir/pull/6338)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* Cleanup of janky encryption apis\r\n([#9390](https://github.com/AztecProtocol/aztec-packages/issues/9390))\r\n([9e3e536](https://github.com/AztecProtocol/aztec-packages/commit/9e3e5361cd43f016ce0a8c7abcaba0d418707da5))\r\n* Deploy & version aztec-up scripts\r\n([#9435](https://github.com/AztecProtocol/aztec-packages/issues/9435))\r\n([ad80169](https://github.com/AztecProtocol/aztec-packages/commit/ad801693592df3263b8a621a081c7616948524da))\r\n* Display every bit in integer tokens\r\n(https://github.com/noir-lang/noir/pull/6360)\r\n([b82f3d1](https://github.com/AztecProtocol/aztec-packages/commit/b82f3d1109a7c15517e9da8613fa90a4699cad83))\r\n* Docker fast\r\n([#9467](https://github.com/AztecProtocol/aztec-packages/issues/9467))\r\n([34e6dd0](https://github.com/AztecProtocol/aztec-packages/commit/34e6dd02718131265510c49f61a1e68271f36b88))\r\n* **docs:** Update getting started docs\r\n([#9426](https://github.com/AztecProtocol/aztec-packages/issues/9426))\r\n([985190b](https://github.com/AztecProtocol/aztec-packages/commit/985190b263016038c4c5814b03c891b46e3b3f56))\r\n* Fix panic in comptime code\r\n(https://github.com/noir-lang/noir/pull/6361)\r\n([f386612](https://github.com/AztecProtocol/aztec-packages/commit/f3866129d467da23224865232a67f6ca20c21151))\r\n* Fix panic in comptime code\r\n(https://github.com/noir-lang/noir/pull/6361)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* Formatter didn't format `&gt;>=` well\r\n(https://github.com/noir-lang/noir/pull/6337)\r\n([b4db379](https://github.com/AztecProtocol/aztec-packages/commit/b4db37908d452ca86399baded392d5e3e86c7bc8))\r\n* Honk shplemini acir artifacts\r\n([#9550](https://github.com/AztecProtocol/aztec-packages/issues/9550))\r\n([468c100](https://github.com/AztecProtocol/aztec-packages/commit/468c100558f181408ad59b528ad4e43aaa7e7f3a))\r\n* Issue in partial notes API\r\n([#9555](https://github.com/AztecProtocol/aztec-packages/issues/9555))\r\n([9d66c1a](https://github.com/AztecProtocol/aztec-packages/commit/9d66c1abca1af9ddb0715627fad87c2efc612a1d))\r\n* LSP auto-import would import public item inside private module\r\n(https://github.com/noir-lang/noir/pull/6366)\r\n([f386612](https://github.com/AztecProtocol/aztec-packages/commit/f3866129d467da23224865232a67f6ca20c21151))\r\n* Make keccak256 work with input lengths greater than 136 bytes\r\n(https://github.com/noir-lang/noir/pull/6393)\r\n([b82f3d1](https://github.com/AztecProtocol/aztec-packages/commit/b82f3d1109a7c15517e9da8613fa90a4699cad83))\r\n* Make sure kind tests run every master commit\r\n([#9478](https://github.com/AztecProtocol/aztec-packages/issues/9478))\r\n([78de316](https://github.com/AztecProtocol/aztec-packages/commit/78de3166ee6499670d7eff99892306d19d86481d))\r\n* Mutable global pattern didn't have a span\r\n(https://github.com/noir-lang/noir/pull/6328)\r\n([b4db379](https://github.com/AztecProtocol/aztec-packages/commit/b4db37908d452ca86399baded392d5e3e86c7bc8))\r\n* Remove assumed parent traits\r\n(https://github.com/noir-lang/noir/pull/6365)\r\n([f386612](https://github.com/AztecProtocol/aztec-packages/commit/f3866129d467da23224865232a67f6ca20c21151))\r\n* Remove unnecessary ivpk's from aztec-nr\r\n([#9460](https://github.com/AztecProtocol/aztec-packages/issues/9460))\r\n([c6437cc](https://github.com/AztecProtocol/aztec-packages/commit/c6437cc98c0c0bb5ed779f7680c54a4304c9e406))\r\n* Replace npk_m_hash with addresses\r\n([#9461](https://github.com/AztecProtocol/aztec-packages/issues/9461))\r\n([f4ed55b](https://github.com/AztecProtocol/aztec-packages/commit/f4ed55b264ff92979e6e655508b8f8fac826086e))\r\n* Revert \"feat: sol shplemini in acir tests + contract_gen\"\r\n([#9505](https://github.com/AztecProtocol/aztec-packages/issues/9505))\r\n([3351217](https://github.com/AztecProtocol/aztec-packages/commit/3351217a7e7f1848c43e14d19427e1cd789c78fc))\r\n* Slightly better formatting of empty blocks with comments\r\n(https://github.com/noir-lang/noir/pull/6367)\r\n([f386612](https://github.com/AztecProtocol/aztec-packages/commit/f3866129d467da23224865232a67f6ca20c21151))\r\n* Spot_strategy passing\r\n([#9428](https://github.com/AztecProtocol/aztec-packages/issues/9428))\r\n([1e38d3e](https://github.com/AztecProtocol/aztec-packages/commit/1e38d3e865fa8fb2b9ba142b5bc5ca59b4c04945))\r\n* **ssa:** Do not mark an array from a parameter mutable\r\n(https://github.com/noir-lang/noir/pull/6355)\r\n([f386612](https://github.com/AztecProtocol/aztec-packages/commit/f3866129d467da23224865232a67f6ca20c21151))\r\n* **ssa:** Do not mark an array from a parameter mutable\r\n(https://github.com/noir-lang/noir/pull/6355)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* Yarn build:fast\r\n([#9464](https://github.com/AztecProtocol/aztec-packages/issues/9464))\r\n([bbe6d06](https://github.com/AztecProtocol/aztec-packages/commit/bbe6d06e04330bd158d1c6f6a328ccdf7d1f3a88))\r\n* Yarn project bootstrap fast\r\n([#9440](https://github.com/AztecProtocol/aztec-packages/issues/9440))\r\n([c1ebed5](https://github.com/AztecProtocol/aztec-packages/commit/c1ebed5ee199246db51461bb84541a104e8abee9))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Add serdes and eq for address note\r\n([#9544](https://github.com/AztecProtocol/aztec-packages/issues/9544))\r\n([74bcfab](https://github.com/AztecProtocol/aztec-packages/commit/74bcfabb2d6d9e2580d2114276c9731d67183021))\r\n* Add some tests for type aliases\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* Add test to check that duplicate definitions generated from macros\r\nthrows error (https://github.com/noir-lang/noir/pull/6351)\r\n([f386612](https://github.com/AztecProtocol/aztec-packages/commit/f3866129d467da23224865232a67f6ca20c21151))\r\n* Add test to check that duplicate definitions generated from macros\r\nthrows error (https://github.com/noir-lang/noir/pull/6351)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* Align debug logging between AVM sim & witgen\r\n([#9498](https://github.com/AztecProtocol/aztec-packages/issues/9498))\r\n([7c2d67a](https://github.com/AztecProtocol/aztec-packages/commit/7c2d67a7c63a2b05d8f8d48b1690c87e8bacfc49))\r\n* **avm::** Fix execution tests in proving mode\r\n([#9466](https://github.com/AztecProtocol/aztec-packages/issues/9466))\r\n([8e07de8](https://github.com/AztecProtocol/aztec-packages/commit/8e07de8233929d40a433a80064ceec30a69c1360))\r\n* **avm:** Allocate memory for unshifted polynomials according to their\r\ntrace col size\r\n([#9345](https://github.com/AztecProtocol/aztec-packages/issues/9345))\r\n([a67d0e2](https://github.com/AztecProtocol/aztec-packages/commit/a67d0e2122945998119a8643a4fb4e74fccc7f34))\r\n* Bumping L2 gas and public reads constants\r\n([#9431](https://github.com/AztecProtocol/aztec-packages/issues/9431))\r\n([91c50dd](https://github.com/AztecProtocol/aztec-packages/commit/91c50dd6c52bc95aab4748d022516fc1b5fd5fe6))\r\n* **CI:** Remove end-to-end/Earthfile\r\n([#9364](https://github.com/AztecProtocol/aztec-packages/issues/9364))\r\n([2823cbb](https://github.com/AztecProtocol/aztec-packages/commit/2823cbbef0eb03c40a2bdf4ad587b79cd8e9bbb2)),\r\ncloses\r\n[#9221](https://github.com/AztecProtocol/aztec-packages/issues/9221)\r\n* Clean up note processor after changes due to address\r\n([#9401](https://github.com/AztecProtocol/aztec-packages/issues/9401))\r\n([d33c988](https://github.com/AztecProtocol/aztec-packages/commit/d33c988b60d0c76d16921fdb985ac7f4919423a8))\r\n* Disable e2e_fees_dapp_subscription\r\n([#9489](https://github.com/AztecProtocol/aztec-packages/issues/9489))\r\n([26416b6](https://github.com/AztecProtocol/aztec-packages/commit/26416b6193bd352f91ebf1f97d9c1dfa5fda4616))\r\n* Disable flakey e2e_synching.test.ts\r\n([#9439](https://github.com/AztecProtocol/aztec-packages/issues/9439))\r\n([01147a5](https://github.com/AztecProtocol/aztec-packages/commit/01147a59bb67a6aec1a9d41d06f97c7bafb23ac6))\r\n* Dont show aws creds in docker fast\r\n([#9465](https://github.com/AztecProtocol/aztec-packages/issues/9465))\r\n([a6d8f48](https://github.com/AztecProtocol/aztec-packages/commit/a6d8f488b1dba07efa5bf7a68eed3c49b1918f97))\r\n* Fix sync scripts\r\n([#9423](https://github.com/AztecProtocol/aztec-packages/issues/9423))\r\n([7766c8e](https://github.com/AztecProtocol/aztec-packages/commit/7766c8e714185d6e8b9fa392d7f371fb30da8f1a))\r\n* Have 'aztec' honour the 'DEBUG' env var\r\n([#9413](https://github.com/AztecProtocol/aztec-packages/issues/9413))\r\n([771a2ac](https://github.com/AztecProtocol/aztec-packages/commit/771a2ac6c834509f7eee9f0ae485147f4a045773))\r\n* Minor tweaks to comptime doc\r\n(https://github.com/noir-lang/noir/pull/6357)\r\n([f386612](https://github.com/AztecProtocol/aztec-packages/commit/f3866129d467da23224865232a67f6ca20c21151))\r\n* Minor tweaks to comptime doc\r\n(https://github.com/noir-lang/noir/pull/6357)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* Minting only private or public balance in Token TXE tests\r\n([#9491](https://github.com/AztecProtocol/aztec-packages/issues/9491))\r\n([b8c015b](https://github.com/AztecProtocol/aztec-packages/commit/b8c015b2875b3945bf105443e607b04a94d28180))\r\n* Node follow prune and extend chain\r\n([#9328](https://github.com/AztecProtocol/aztec-packages/issues/9328))\r\n([a653fd3](https://github.com/AztecProtocol/aztec-packages/commit/a653fd3a11b47862b5f6cac646296bff3d2ac8f4))\r\n* Noir bug workaround\r\n([#9443](https://github.com/AztecProtocol/aztec-packages/issues/9443))\r\n([f619687](https://github.com/AztecProtocol/aztec-packages/commit/f61968767e6160eaf52edf62b8a4f7df663b5a68))\r\n* Passing partial note logs through transient storage\r\n([#9356](https://github.com/AztecProtocol/aztec-packages/issues/9356))\r\n([8835b31](https://github.com/AztecProtocol/aztec-packages/commit/8835b31d76b2f7c45416eaf67a748d8df9dbc753))\r\n* Redo typo PR by defitricks\r\n([#9571](https://github.com/AztecProtocol/aztec-packages/issues/9571))\r\n([9a5dce3](https://github.com/AztecProtocol/aztec-packages/commit/9a5dce37983a70e82527e3a9e2f9846a8a266c5a))\r\n* Remove ovpk as param in boxes contracts\r\n([#9495](https://github.com/AztecProtocol/aztec-packages/issues/9495))\r\n([2b24b98](https://github.com/AztecProtocol/aztec-packages/commit/2b24b986e72467946cc230df534f21b3d352abd4))\r\n* Remove unnecessary trait\r\n([#9437](https://github.com/AztecProtocol/aztec-packages/issues/9437))\r\n([1db2eec](https://github.com/AztecProtocol/aztec-packages/commit/1db2eececfba1b8d619ddee195a70b934f9f0d3b))\r\n* Rename private function in L2 block stream\r\n([#9481](https://github.com/AztecProtocol/aztec-packages/issues/9481))\r\n([a34d4aa](https://github.com/AztecProtocol/aztec-packages/commit/a34d4aae20600f682835f5bcd43bd866461b239a)),\r\ncloses\r\n[#9314](https://github.com/AztecProtocol/aztec-packages/issues/9314)\r\n* Replace relative paths to noir-protocol-circuits\r\n([4f2d67c](https://github.com/AztecProtocol/aztec-packages/commit/4f2d67c26d7996b297cfb0b82c0b0ec59ba12d68))\r\n* Replace relative paths to noir-protocol-circuits\r\n([33f2151](https://github.com/AztecProtocol/aztec-packages/commit/33f21518e4693ca579d94eeb06e127d7a726e80a))\r\n* Replace relative paths to noir-protocol-circuits\r\n([5247be2](https://github.com/AztecProtocol/aztec-packages/commit/5247be27868e9cee7f0cbc423560fc3685f66422))\r\n* Replace relative paths to noir-protocol-circuits\r\n([49467ba](https://github.com/AztecProtocol/aztec-packages/commit/49467bade09f1d28cc4ae874e190a9d0613f4ac0))\r\n* Replace relative paths to noir-protocol-circuits\r\n([f6d714f](https://github.com/AztecProtocol/aztec-packages/commit/f6d714f954e599a07e7d1e6f18138f9fd7b85d60))\r\n* Replace relative paths to noir-protocol-circuits\r\n([b4841ad](https://github.com/AztecProtocol/aztec-packages/commit/b4841ad84b58d5b11c261b4fd412e66c1b017d37))\r\n* Replace token note with uint note\r\n([#8143](https://github.com/AztecProtocol/aztec-packages/issues/8143))\r\n([493a3f3](https://github.com/AztecProtocol/aztec-packages/commit/493a3f3ff25725026800f8fa116b41ea4b5760ed))\r\n* Run tests in metaprogramming.rs\r\n(https://github.com/noir-lang/noir/pull/6339)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* Split base rollup and remove public kernel proving\r\n([#9434](https://github.com/AztecProtocol/aztec-packages/issues/9434))\r\n([4316242](https://github.com/AztecProtocol/aztec-packages/commit/43162420776a14e39eae8462cf50833cf7ba067c))\r\n* Switch to btreeset for deterministic ordering\r\n(https://github.com/noir-lang/noir/pull/6348)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* Update title from feedback\r\n(https://github.com/noir-lang/noir/pull/6334)\r\n([b4db379](https://github.com/AztecProtocol/aztec-packages/commit/b4db37908d452ca86399baded392d5e3e86c7bc8))\r\n* Use array instead of Vec in keccak256\r\n(https://github.com/noir-lang/noir/pull/6395)\r\n([b82f3d1](https://github.com/AztecProtocol/aztec-packages/commit/b82f3d1109a7c15517e9da8613fa90a4699cad83))\r\n* Use big endian in sha\r\n([#9471](https://github.com/AztecProtocol/aztec-packages/issues/9471))\r\n([bc9828e](https://github.com/AztecProtocol/aztec-packages/commit/bc9828e03ba0924c2cfdaffb4b7455c8eebf01e9))\r\n* Use Brillig opcode when possible for less-than operations on fields\r\n([#9416](https://github.com/AztecProtocol/aztec-packages/issues/9416))\r\n([e50303d](https://github.com/AztecProtocol/aztec-packages/commit/e50303d4bbdce78dadb6f4239408aa02a3bc0235))\r\n\r\n\r\n### Documentation\r\n\r\n* Clean up docker messaging\r\n([#9419](https://github.com/AztecProtocol/aztec-packages/issues/9419))\r\n([4c4974f](https://github.com/AztecProtocol/aztec-packages/commit/4c4974f0d49ed3623accf78b292b58beb73e6a0e))\r\n</details>\r\n\r\n<details><summary>barretenberg: 0.61.0</summary>\r\n\r\n##\r\n[0.61.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.60.0...barretenberg-v0.61.0)\r\n(2024-10-30)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* **avm:** cleanup CALL\r\n([#9551](https://github.com/AztecProtocol/aztec-packages/issues/9551))\r\n* **avm:** returndatasize + returndatacopy\r\n([#9475](https://github.com/AztecProtocol/aztec-packages/issues/9475))\r\n* getcontractinstance instruction returns only a specified member\r\n([#9300](https://github.com/AztecProtocol/aztec-packages/issues/9300))\r\n* **avm/brillig:** revert/rethrow oracle\r\n([#9408](https://github.com/AztecProtocol/aztec-packages/issues/9408))\r\n\r\n### Features\r\n\r\n* 20-30% cost reduction in recursive ipa algorithm\r\n([#9420](https://github.com/AztecProtocol/aztec-packages/issues/9420))\r\n([a4bd3e1](https://github.com/AztecProtocol/aztec-packages/commit/a4bd3e14f6cde05f4d59bc48142e9ef4bc78f0ae))\r\n* **avm/brillig:** Revert/rethrow oracle\r\n([#9408](https://github.com/AztecProtocol/aztec-packages/issues/9408))\r\n([1bbd724](https://github.com/AztecProtocol/aztec-packages/commit/1bbd724eab39c193c1db1d89570eab9358563fe2))\r\n* **avm:** Avm replace zeromorph pcs by shplemini\r\n([#9389](https://github.com/AztecProtocol/aztec-packages/issues/9389))\r\n([07d6dc2](https://github.com/AztecProtocol/aztec-packages/commit/07d6dc29db2eb04154b8f0c66bd1efa74c0e8b9d))\r\n* **avm:** Cleanup CALL\r\n([#9551](https://github.com/AztecProtocol/aztec-packages/issues/9551))\r\n([26adc55](https://github.com/AztecProtocol/aztec-packages/commit/26adc55771a204f96e8594f6defde2a4872c88d2))\r\n* **avm:** Merkle tree gadget\r\n([#9205](https://github.com/AztecProtocol/aztec-packages/issues/9205))\r\n([d52b616](https://github.com/AztecProtocol/aztec-packages/commit/d52b616a91224c25f24a00b76b984f059c103dcb))\r\n* **avm:** Returndatasize + returndatacopy\r\n([#9475](https://github.com/AztecProtocol/aztec-packages/issues/9475))\r\n([8f71006](https://github.com/AztecProtocol/aztec-packages/commit/8f710068a10e09fad9c159306c19c555bb3b5bb6))\r\n* **avm:** Trace contract class and contract instance\r\n([#8840](https://github.com/AztecProtocol/aztec-packages/issues/8840))\r\n([84205d8](https://github.com/AztecProtocol/aztec-packages/commit/84205d872067345239913914a84b708d05d8364c))\r\n* Bytecode hashing init\r\n([#8535](https://github.com/AztecProtocol/aztec-packages/issues/8535))\r\n([2bb09e5](https://github.com/AztecProtocol/aztec-packages/commit/2bb09e59f648e6182f1097d283451afd3c488d27))\r\n* Derive address and class id in avm\r\n([#8897](https://github.com/AztecProtocol/aztec-packages/issues/8897))\r\n([2ebe361](https://github.com/AztecProtocol/aztec-packages/commit/2ebe3611ad3826443b31e5626a4e08cdd90f0f2a))\r\n* Fixed number of pub inputs for databus commitment propagation\r\n([#9336](https://github.com/AztecProtocol/aztec-packages/issues/9336))\r\n([8658abd](https://github.com/AztecProtocol/aztec-packages/commit/8658abd46612d3fdf8c8b54902c201c790a52345))\r\n* Getcontractinstance instruction returns only a specified member\r\n([#9300](https://github.com/AztecProtocol/aztec-packages/issues/9300))\r\n([29b692f](https://github.com/AztecProtocol/aztec-packages/commit/29b692f9e81e1ee809e37274cf6ac2ab0ca526ce))\r\n* Print finalized size and log dyadic size during Ultra proof\r\nconstruction\r\n([#9411](https://github.com/AztecProtocol/aztec-packages/issues/9411))\r\n([84fdc52](https://github.com/AztecProtocol/aztec-packages/commit/84fdc526f73027a3450bcdcc78b826fc9da8df88))\r\n* Reorder blocks for efficiency\r\n([#9560](https://github.com/AztecProtocol/aztec-packages/issues/9560))\r\n([10874f4](https://github.com/AztecProtocol/aztec-packages/commit/10874f402c48c0721491f0db8bc0266653193d9b))\r\n* Sol shplemini in acir tests + contract_gen\r\n([#8874](https://github.com/AztecProtocol/aztec-packages/issues/8874))\r\n([1c0275d](https://github.com/AztecProtocol/aztec-packages/commit/1c0275db18510fd7d55b400e4a910447859f4acc))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Add native verification test to honk keccak\r\n([#9501](https://github.com/AztecProtocol/aztec-packages/issues/9501))\r\n([59810e0](https://github.com/AztecProtocol/aztec-packages/commit/59810e070e57fa8e250928608b39c66eaae39a84))\r\n* **avm:** Address bytecode hashing comments\r\n([#9436](https://github.com/AztecProtocol/aztec-packages/issues/9436))\r\n([a85f92a](https://github.com/AztecProtocol/aztec-packages/commit/a85f92a24f4ec988a4d472651a0e2827bf9381b2))\r\n* **avm:** Re-enable sha256 in bulk test, fix bug in AVM SHL/SHR\r\n([#9496](https://github.com/AztecProtocol/aztec-packages/issues/9496))\r\n([0fe64df](https://github.com/AztecProtocol/aztec-packages/commit/0fe64dfabe6b4413943204ec17a5d0dca3c2d011))\r\n* Honk shplemini acir artifacts\r\n([#9550](https://github.com/AztecProtocol/aztec-packages/issues/9550))\r\n([468c100](https://github.com/AztecProtocol/aztec-packages/commit/468c100558f181408ad59b528ad4e43aaa7e7f3a))\r\n* Revert \"feat: sol shplemini in acir tests + contract_gen\"\r\n([#9505](https://github.com/AztecProtocol/aztec-packages/issues/9505))\r\n([3351217](https://github.com/AztecProtocol/aztec-packages/commit/3351217a7e7f1848c43e14d19427e1cd789c78fc))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Align debug logging between AVM sim & witgen\r\n([#9498](https://github.com/AztecProtocol/aztec-packages/issues/9498))\r\n([7c2d67a](https://github.com/AztecProtocol/aztec-packages/commit/7c2d67a7c63a2b05d8f8d48b1690c87e8bacfc49))\r\n* **avm::** Fix execution tests in proving mode\r\n([#9466](https://github.com/AztecProtocol/aztec-packages/issues/9466))\r\n([8e07de8](https://github.com/AztecProtocol/aztec-packages/commit/8e07de8233929d40a433a80064ceec30a69c1360))\r\n* **avm:** Allocate memory for unshifted polynomials according to their\r\ntrace col size\r\n([#9345](https://github.com/AztecProtocol/aztec-packages/issues/9345))\r\n([a67d0e2](https://github.com/AztecProtocol/aztec-packages/commit/a67d0e2122945998119a8643a4fb4e74fccc7f34))\r\n* Bumping L2 gas and public reads constants\r\n([#9431](https://github.com/AztecProtocol/aztec-packages/issues/9431))\r\n([91c50dd](https://github.com/AztecProtocol/aztec-packages/commit/91c50dd6c52bc95aab4748d022516fc1b5fd5fe6))\r\n* Use big endian in sha\r\n([#9471](https://github.com/AztecProtocol/aztec-packages/issues/9471))\r\n([bc9828e](https://github.com/AztecProtocol/aztec-packages/commit/bc9828e03ba0924c2cfdaffb4b7455c8eebf01e9))\r\n</details>\r\n\r\n---\r\nThis PR was generated with [Release\r\nPlease](https://github.com/googleapis/release-please). See\r\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2024-10-30T12:19:02Z",
          "tree_id": "bdffa0d5dd08dac38884b7b5c2bd20c8b09e4eaf",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d9de430e4a01d6908a9b1fe5e6ede9309aa8a10d"
        },
        "date": 1730292271889,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30568.734113000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28522.855007000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5351.957244000019,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5039.629615999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91820.37951800002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91820381000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15169.424408999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15169424000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2677113021,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2677113021 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 124772316,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 124772316 ns\nthreads: 1"
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
          "id": "5f386963b06752087c2600949cbb4bb2910b25ef",
          "message": "feat(avm)!: use 32 bit locations (#9596)\n\nContrary to what was expected months ago, we have to support contracts > 65 kB. So we need 32 bit locations in the upcoming move to byte-indexed PCs. This increseases bytecode ~8% in the short term. In the longer term, we might introduce relative jumps with 8 and 16 bit variants. That would likely leave us in an even better place than where we are today.\r\n\r\nPart of #9059.",
          "timestamp": "2024-10-30T17:06:17Z",
          "tree_id": "d69b174f994341af74ea4b06a9a284e4a18f829a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5f386963b06752087c2600949cbb4bb2910b25ef"
        },
        "date": 1730309688154,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30537.163948,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28830.413115000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5378.605791999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5081.097699 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 90934.590223,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 90934592000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15165.98959,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15165989000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2706576734,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2706576734 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126468834,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126468834 ns\nthreads: 1"
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
          "id": "9211d8afbd0fe31043ea593675ce5a72c1dc7e4e",
          "message": "feat: biggroup_goblin handles points at infinity + 1.8x reduction in ECCVM size (#9366)\n\nThis PR adds support for biggroup_goblin handling elliptic curve points\r\nat infinity\r\n\r\nThis feature is used to optimize the ECCVM instructions created when\r\nrunning a recursive protogalaxy verifier.\r\n\r\nInstead of performing size-2 scalar multiplications for every\r\nwitness/commitment, additional random challenges are generated in order\r\nto evaluate two large batch multiplications.\r\n\r\nThe technique implemented is described in\r\nhttps://hackmd.io/T1239dufTgO1v8Ie7EExlQ?view\r\n\r\nIn the case of ClientIVCRecursionTests.ClientTubeBase where the number\r\nof circuits is set to four, this reduces the size of the ECCVM execution\r\ntrace size by 45%, which is good enough to reduce the log dyadic size of\r\nthe ClientIVCVerifier by 1/2.",
          "timestamp": "2024-10-30T15:51:29-04:00",
          "tree_id": "7ee95de7b97c8ef0dba2446e00440f68d104ccc8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9211d8afbd0fe31043ea593675ce5a72c1dc7e4e"
        },
        "date": 1730320299950,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29271.485224000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27417.830350000004 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5419.456435000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5083.737690000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86281.51837499999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86281520000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15209.479228999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15209479000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2516740076,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2516740076 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126019837,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126019837 ns\nthreads: 1"
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
          "id": "722ec5c3dfdc2a5e467528ed94a25677f8800087",
          "message": "feat: faster square roots (#2694)\n\nWe use the Tonelli-Shanks square root algorithm to perform square roots,\r\nrequired for deriving generators on the Grumpkin curve.\r\n\r\nOur existing implementation uses a slow algorithm that requires ~1,000\r\nfield multiplications per square root.\r\n\r\nThis PR implements a newer algorithm by Bernstein that uses precomputed\r\nlookup tables to increase performance\r\n\r\nhttps://cr.yp.to/papers/sqroot-20011123-retypeset20220327.pdf",
          "timestamp": "2024-10-30T17:54:29-04:00",
          "tree_id": "9dfa0c8467e712b8f4a9bdfe6b6bde11d20f9510",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/722ec5c3dfdc2a5e467528ed94a25677f8800087"
        },
        "date": 1730327613020,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29168.44631999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27502.004968999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5384.818256000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5045.767242 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86206.17749599999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86206180000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15132.977390999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15132977000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2498302551,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2498302551 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127878727,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127878727 ns\nthreads: 1"
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
          "id": "747bff1acbca3d263a765db82baa6ef9ca58c372",
          "message": "chore: bb sanitizers on master (#9564)\n\nThis is free QA, though sanitizers likely aren't clean. Let's enable\r\nthis and turn off what breaks",
          "timestamp": "2024-10-31T00:13:29Z",
          "tree_id": "d21944a326cc7b2b789c4892ad7ef89b77650e43",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/747bff1acbca3d263a765db82baa6ef9ca58c372"
        },
        "date": 1730335205935,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29072.96704999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27302.109651 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5341.850662999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5014.940085 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86621.50410800001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86621506000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15083.171796,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15083171000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2507322254,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2507322254 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125933660,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125933660 ns\nthreads: 1"
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
          "id": "feace70727f9e5a971809955030a8ea88ce84f4a",
          "message": "fix: Resolution of bugs from bigfield audits (#9547)\n\nThis PR resolves Critical, High, Medium, Low and some informational\r\nissues from the bigfield test audits by ZKSecurity, Zellic and Spearbit\r\n\r\n---------\r\n\r\nCo-authored-by: Sarkoxed <sarkoxed2013@yandex.ru>",
          "timestamp": "2024-10-31T14:44:03Z",
          "tree_id": "2df25d38969cc420b856f5ccb5b6245bd9a4742a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/feace70727f9e5a971809955030a8ea88ce84f4a"
        },
        "date": 1730388104836,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29017.037254999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27310.968871 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5355.483168000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5035.9659329999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86797.26345600002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86797266000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15083.60771,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15083608000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2492365482,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2492365482 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127741613,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127741613 ns\nthreads: 1"
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
          "id": "392114a0a66bd580175ff7a07b0c6d899d69be8f",
          "message": "feat: spartan proving (#9584)\n\nThis PR adds K8s config to deploy a network with proving enabled\r\n\r\n---------\r\n\r\nCo-authored-by: PhilWindle <60546371+PhilWindle@users.noreply.github.com>\r\nCo-authored-by: ludamad <adam.domurad@gmail.com>",
          "timestamp": "2024-10-31T14:43:45Z",
          "tree_id": "2a9a733215cc671ab7f19b5bee59bc9baca1d9a5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/392114a0a66bd580175ff7a07b0c6d899d69be8f"
        },
        "date": 1730388117187,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29038.40440899998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27588.387776999996 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5345.783819000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5038.791959 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86221.087194,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86221089000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15038.765556,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15038766000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2486578167,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2486578167 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127340470,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127340470 ns\nthreads: 1"
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
          "id": "04dd2c4c959d5d80e527be9c71504c051e3c5929",
          "message": "fix: Ensuring translator range constraint polynomials are zeroes outside of minicircuit (#9251)\n\nWhen Translator was built, there was expectation on using ZM's degree\r\nchecks for minicircuit polynomials later. ZM is dead, so we have to\r\nenforce those in another way so there is no soundness issue during\r\npolynomial concatenation. This PR adds relations to ensure\r\nrange_constraint polynomials are zero outside of minicircuit\r\n\r\nClientIVC before:\r\n\r\n![image](https://github.com/user-attachments/assets/6299f04b-41de-4f41-90e4-45e49bf42470)\r\nClientIVC after:\r\n\r\n![image](https://github.com/user-attachments/assets/5b0c8677-ee3f-4195-898e-892ef38e9eef)\r\n\r\nFixes https://github.com/AztecProtocol/barretenberg/issues/1128",
          "timestamp": "2024-10-31T16:07:52Z",
          "tree_id": "d1c72b41fc5ce364658ef2a000c861f00c2c347e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/04dd2c4c959d5d80e527be9c71504c051e3c5929"
        },
        "date": 1730392913622,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28973.78177799999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27509.533153 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5348.173583000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4992.931622 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85819.50574000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85819508000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15070.684988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15070684000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2490302991,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2490302991 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125831171,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125831171 ns\nthreads: 1"
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
          "id": "3ed5ad0aee288ce4230aa9b36196c0422610c39b",
          "message": "chore(master): Release 0.62.0",
          "timestamp": "2024-11-01T13:15:45Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/9583/commits/3ed5ad0aee288ce4230aa9b36196c0422610c39b"
        },
        "date": 1730468067957,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29034.472476000017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27483.012807 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5318.654448999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4999.423937 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85530.823754,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85530826000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15092.66903,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15092669000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2488625534,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2488625534 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 129744730,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 129744730 ns\nthreads: 1"
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
          "id": "edf6389a783250e5684c5ddd3ec3757623b5b770",
          "message": "chore(master): Release 0.62.0 (#9583)\n\n:robot: I have created a release *beep* *boop*\r\n---\r\n\r\n\r\n<details><summary>aztec-package: 0.62.0</summary>\r\n\r\n##\r\n[0.62.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.61.0...aztec-package-v0.62.0)\r\n(2024-11-01)\r\n\r\n\r\n### Features\r\n\r\n* Token private mint optimization\r\n([#9606](https://github.com/AztecProtocol/aztec-packages/issues/9606))\r\n([e8fadc7](https://github.com/AztecProtocol/aztec-packages/commit/e8fadc799d015046016b16eeadbb55be929d20c2))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* **k8s:** Boot node long sync\r\n([#9610](https://github.com/AztecProtocol/aztec-packages/issues/9610))\r\n([1b85840](https://github.com/AztecProtocol/aztec-packages/commit/1b85840cf52442e920f4c25bf67e6bd2066606bc))\r\n* Multi-node metrics working\r\n([#9486](https://github.com/AztecProtocol/aztec-packages/issues/9486))\r\n([fd974e1](https://github.com/AztecProtocol/aztec-packages/commit/fd974e1ba91e01910751ed87da6dbeb068faba4f))\r\n* Stop bot in case of tx errors\r\n([#9421](https://github.com/AztecProtocol/aztec-packages/issues/9421))\r\n([6650641](https://github.com/AztecProtocol/aztec-packages/commit/6650641e5711ed9746ccc846a0efc0c68aeafdc3))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Replacing unshield naming with transfer_to_public\r\n([#9608](https://github.com/AztecProtocol/aztec-packages/issues/9608))\r\n([247e9eb](https://github.com/AztecProtocol/aztec-packages/commit/247e9eb28e931874e98781addebe9a343ba7afe1))\r\n* Token partial notes refactor pt. 1\r\n([#9490](https://github.com/AztecProtocol/aztec-packages/issues/9490))\r\n([3d631f5](https://github.com/AztecProtocol/aztec-packages/commit/3d631f5e98439554443483520011c1c21d18f993))\r\n</details>\r\n\r\n<details><summary>barretenberg.js: 0.62.0</summary>\r\n\r\n##\r\n[0.62.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.61.0...barretenberg.js-v0.62.0)\r\n(2024-11-01)\r\n\r\n\r\n### Features\r\n\r\n* Faster square roots\r\n([#2694](https://github.com/AztecProtocol/aztec-packages/issues/2694))\r\n([722ec5c](https://github.com/AztecProtocol/aztec-packages/commit/722ec5c3dfdc2a5e467528ed94a25677f8800087))\r\n</details>\r\n\r\n<details><summary>aztec-packages: 0.62.0</summary>\r\n\r\n##\r\n[0.62.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.61.0...aztec-packages-v0.62.0)\r\n(2024-11-01)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* **avm:** use 32 bit locations\r\n([#9596](https://github.com/AztecProtocol/aztec-packages/issues/9596))\r\n* Unique L1 to L2 messages\r\n([#9492](https://github.com/AztecProtocol/aztec-packages/issues/9492))\r\n\r\n### Features\r\n\r\n* Add increment secret oracles\r\n([#9573](https://github.com/AztecProtocol/aztec-packages/issues/9573))\r\n([97a4c0c](https://github.com/AztecProtocol/aztec-packages/commit/97a4c0c4452f31e5c0dc776812242d2444348406))\r\n* **avm:** Use 32 bit locations\r\n([#9596](https://github.com/AztecProtocol/aztec-packages/issues/9596))\r\n([5f38696](https://github.com/AztecProtocol/aztec-packages/commit/5f386963b06752087c2600949cbb4bb2910b25ef))\r\n* Barebones addressbook for tagging\r\n([#9572](https://github.com/AztecProtocol/aztec-packages/issues/9572))\r\n([6526069](https://github.com/AztecProtocol/aztec-packages/commit/6526069b4faabf1a3b6834da9c290e077715a496))\r\n* Biggroup_goblin handles points at infinity + 1.8x reduction in ECCVM\r\nsize\r\n([#9366](https://github.com/AztecProtocol/aztec-packages/issues/9366))\r\n([9211d8a](https://github.com/AztecProtocol/aztec-packages/commit/9211d8afbd0fe31043ea593675ce5a72c1dc7e4e))\r\n* Faster square roots\r\n([#2694](https://github.com/AztecProtocol/aztec-packages/issues/2694))\r\n([722ec5c](https://github.com/AztecProtocol/aztec-packages/commit/722ec5c3dfdc2a5e467528ed94a25677f8800087))\r\n* Fixed private log size\r\n([#9585](https://github.com/AztecProtocol/aztec-packages/issues/9585))\r\n([755c70a](https://github.com/AztecProtocol/aztec-packages/commit/755c70ab55c768681349179e777bb0391c381420))\r\n* Removing register recipient in e2e tests as it is unnecessary now !\r\n([#9499](https://github.com/AztecProtocol/aztec-packages/issues/9499))\r\n([9f52cbb](https://github.com/AztecProtocol/aztec-packages/commit/9f52cbb5df8821f46d88116eedbe10a74f32e75e))\r\n* Reorg test\r\n([#9607](https://github.com/AztecProtocol/aztec-packages/issues/9607))\r\n([54488b3](https://github.com/AztecProtocol/aztec-packages/commit/54488b33ea6ae0cb517639c60dbe7e7aeaf9b5dd))\r\n* Simulate validateEpochProofQuoteHeader in the future\r\n([#9641](https://github.com/AztecProtocol/aztec-packages/issues/9641))\r\n([284c8f8](https://github.com/AztecProtocol/aztec-packages/commit/284c8f8e4504ff8e8d633dc291c20111a0406273))\r\n* Spartan proving\r\n([#9584](https://github.com/AztecProtocol/aztec-packages/issues/9584))\r\n([392114a](https://github.com/AztecProtocol/aztec-packages/commit/392114a0a66bd580175ff7a07b0c6d899d69be8f))\r\n* Sync tagged logs\r\n([#9595](https://github.com/AztecProtocol/aztec-packages/issues/9595))\r\n([0cc4a48](https://github.com/AztecProtocol/aztec-packages/commit/0cc4a4881ea3d61d4ab0bad7594da4f610746f4f))\r\n* Token private mint optimization\r\n([#9606](https://github.com/AztecProtocol/aztec-packages/issues/9606))\r\n([e8fadc7](https://github.com/AztecProtocol/aztec-packages/commit/e8fadc799d015046016b16eeadbb55be929d20c2))\r\n* Unique L1 to L2 messages\r\n([#9492](https://github.com/AztecProtocol/aztec-packages/issues/9492))\r\n([4e5ae95](https://github.com/AztecProtocol/aztec-packages/commit/4e5ae9538ebba834b3c4407cf0597c3a432a2d4e)),\r\ncloses\r\n[#9450](https://github.com/AztecProtocol/aztec-packages/issues/9450)\r\n\r\n\r\n### Bug Fixes\r\n\r\n* E2e event logs test\r\n([#9621](https://github.com/AztecProtocol/aztec-packages/issues/9621))\r\n([737c573](https://github.com/AztecProtocol/aztec-packages/commit/737c5732165b9fc339ab6a15838029481dcfdbf2))\r\n* E2e labels\r\n([#9609](https://github.com/AztecProtocol/aztec-packages/issues/9609))\r\n([ed1deb9](https://github.com/AztecProtocol/aztec-packages/commit/ed1deb9afbc7746fe1668fe35978cb159a02dedf))\r\n* Ensuring translator range constraint polynomials are zeroes outside of\r\nminicircuit\r\n([#9251](https://github.com/AztecProtocol/aztec-packages/issues/9251))\r\n([04dd2c4](https://github.com/AztecProtocol/aztec-packages/commit/04dd2c4c959d5d80e527be9c71504c051e3c5929))\r\n* EventMetadata class implementation for serialisation\r\n([#9574](https://github.com/AztecProtocol/aztec-packages/issues/9574))\r\n([bdff73a](https://github.com/AztecProtocol/aztec-packages/commit/bdff73af3f8043f82ebc3bf7ed1f764a941091c4))\r\n* Force bb-sanitizers true\r\n([#9614](https://github.com/AztecProtocol/aztec-packages/issues/9614))\r\n([39cda86](https://github.com/AztecProtocol/aztec-packages/commit/39cda86c3576c5cb94a7beb123b875a2ba37c26b))\r\n* **k8s:** Boot node long sync\r\n([#9610](https://github.com/AztecProtocol/aztec-packages/issues/9610))\r\n([1b85840](https://github.com/AztecProtocol/aztec-packages/commit/1b85840cf52442e920f4c25bf67e6bd2066606bc))\r\n* Multi-node metrics working\r\n([#9486](https://github.com/AztecProtocol/aztec-packages/issues/9486))\r\n([fd974e1](https://github.com/AztecProtocol/aztec-packages/commit/fd974e1ba91e01910751ed87da6dbeb068faba4f))\r\n* Remove all register recipient functionality in ts\r\n([#9548](https://github.com/AztecProtocol/aztec-packages/issues/9548))\r\n([2f7127b](https://github.com/AztecProtocol/aztec-packages/commit/2f7127be39f97873d3b3bc55d1a20d6de82f583f))\r\n* Remove unnecessary ivpk references in ts\r\n([#9463](https://github.com/AztecProtocol/aztec-packages/issues/9463))\r\n([0c5121f](https://github.com/AztecProtocol/aztec-packages/commit/0c5121ffc0f7b5073a57d04d38f304ef1b33fe7b))\r\n* Resolution of bugs from bigfield audits\r\n([#9547](https://github.com/AztecProtocol/aztec-packages/issues/9547))\r\n([feace70](https://github.com/AztecProtocol/aztec-packages/commit/feace70727f9e5a971809955030a8ea88ce84f4a))\r\n* Stop bot in case of tx errors\r\n([#9421](https://github.com/AztecProtocol/aztec-packages/issues/9421))\r\n([6650641](https://github.com/AztecProtocol/aztec-packages/commit/6650641e5711ed9746ccc846a0efc0c68aeafdc3))\r\n* Typing of artifacts\r\n([#9581](https://github.com/AztecProtocol/aztec-packages/issues/9581))\r\n([c71645f](https://github.com/AztecProtocol/aztec-packages/commit/c71645f4cc9754d99eb3ac77ff8063495caa264d))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Add guides to get_e2e_jobs.sh\r\n([#9624](https://github.com/AztecProtocol/aztec-packages/issues/9624))\r\n([8891ead](https://github.com/AztecProtocol/aztec-packages/commit/8891ead6c20da220316c6a6fea1e8f2f0bf954b5))\r\n* Add sender to encode and encrypt\r\n([#9562](https://github.com/AztecProtocol/aztec-packages/issues/9562))\r\n([8ce6834](https://github.com/AztecProtocol/aztec-packages/commit/8ce6834ddcfe48aa672632012c48d5d679c8687c))\r\n* Add signed int deserialization to decoder\r\n([#9557](https://github.com/AztecProtocol/aztec-packages/issues/9557))\r\n([0435d00](https://github.com/AztecProtocol/aztec-packages/commit/0435d00671d7f6b6960a685e3e5b76db574c56da))\r\n* Bb sanitizers on master\r\n([#9564](https://github.com/AztecProtocol/aztec-packages/issues/9564))\r\n([747bff1](https://github.com/AztecProtocol/aztec-packages/commit/747bff1acbca3d263a765db82baa6ef9ca58c372))\r\n* Cleaning up token test utils\r\n([#9633](https://github.com/AztecProtocol/aztec-packages/issues/9633))\r\n([325bdb0](https://github.com/AztecProtocol/aztec-packages/commit/325bdb021f05c82a3abfa1fa0acd8d24635cbd10))\r\n* Disable breaking e2e_event_logs test\r\n([#9602](https://github.com/AztecProtocol/aztec-packages/issues/9602))\r\n([cf2ca2e](https://github.com/AztecProtocol/aztec-packages/commit/cf2ca2ed452a398e0bbfd7a4f079c35484f52884))\r\n* Dont generate vks for simulated circuits\r\n([#9625](https://github.com/AztecProtocol/aztec-packages/issues/9625))\r\n([366eff3](https://github.com/AztecProtocol/aztec-packages/commit/366eff3bfa237fbe0e06bed39eeeefd36f8f95d6))\r\n* Fixing broken sample-dapp tests\r\n([#9597](https://github.com/AztecProtocol/aztec-packages/issues/9597))\r\n([5e52900](https://github.com/AztecProtocol/aztec-packages/commit/5e52900b245a167a9e5697c7b6b25e1d8df42be9))\r\n* Nuking `Token::privately_mint_private_note(...)`\r\n([#9616](https://github.com/AztecProtocol/aztec-packages/issues/9616))\r\n([bf53f5e](https://github.com/AztecProtocol/aztec-packages/commit/bf53f5e0b792e00a45013a16adb72a952e527cb9))\r\n* Pass on docker_fast.sh\r\n([#9615](https://github.com/AztecProtocol/aztec-packages/issues/9615))\r\n([1c53459](https://github.com/AztecProtocol/aztec-packages/commit/1c53459ff31b50ba808e204c532885c9b0f69e39))\r\n* Remove outgoing tagging field in logs\r\n([#9502](https://github.com/AztecProtocol/aztec-packages/issues/9502))\r\n([c473380](https://github.com/AztecProtocol/aztec-packages/commit/c473380026e2a8eafff91c4f57e9c2ec8f2718f0))\r\n* Replace relative paths to noir-protocol-circuits\r\n([288099b](https://github.com/AztecProtocol/aztec-packages/commit/288099b89dea0911adb04dd48af531c7a56daf21))\r\n* Replacing unshield naming with transfer_to_public\r\n([#9608](https://github.com/AztecProtocol/aztec-packages/issues/9608))\r\n([247e9eb](https://github.com/AztecProtocol/aztec-packages/commit/247e9eb28e931874e98781addebe9a343ba7afe1))\r\n* Token partial notes refactor pt. 1\r\n([#9490](https://github.com/AztecProtocol/aztec-packages/issues/9490))\r\n([3d631f5](https://github.com/AztecProtocol/aztec-packages/commit/3d631f5e98439554443483520011c1c21d18f993))\r\n</details>\r\n\r\n<details><summary>barretenberg: 0.62.0</summary>\r\n\r\n##\r\n[0.62.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.61.0...barretenberg-v0.62.0)\r\n(2024-11-01)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* **avm:** use 32 bit locations\r\n([#9596](https://github.com/AztecProtocol/aztec-packages/issues/9596))\r\n\r\n### Features\r\n\r\n* **avm:** Use 32 bit locations\r\n([#9596](https://github.com/AztecProtocol/aztec-packages/issues/9596))\r\n([5f38696](https://github.com/AztecProtocol/aztec-packages/commit/5f386963b06752087c2600949cbb4bb2910b25ef))\r\n* Biggroup_goblin handles points at infinity + 1.8x reduction in ECCVM\r\nsize\r\n([#9366](https://github.com/AztecProtocol/aztec-packages/issues/9366))\r\n([9211d8a](https://github.com/AztecProtocol/aztec-packages/commit/9211d8afbd0fe31043ea593675ce5a72c1dc7e4e))\r\n* Faster square roots\r\n([#2694](https://github.com/AztecProtocol/aztec-packages/issues/2694))\r\n([722ec5c](https://github.com/AztecProtocol/aztec-packages/commit/722ec5c3dfdc2a5e467528ed94a25677f8800087))\r\n* Spartan proving\r\n([#9584](https://github.com/AztecProtocol/aztec-packages/issues/9584))\r\n([392114a](https://github.com/AztecProtocol/aztec-packages/commit/392114a0a66bd580175ff7a07b0c6d899d69be8f))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Ensuring translator range constraint polynomials are zeroes outside of\r\nminicircuit\r\n([#9251](https://github.com/AztecProtocol/aztec-packages/issues/9251))\r\n([04dd2c4](https://github.com/AztecProtocol/aztec-packages/commit/04dd2c4c959d5d80e527be9c71504c051e3c5929))\r\n* Resolution of bugs from bigfield audits\r\n([#9547](https://github.com/AztecProtocol/aztec-packages/issues/9547))\r\n([feace70](https://github.com/AztecProtocol/aztec-packages/commit/feace70727f9e5a971809955030a8ea88ce84f4a))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Bb sanitizers on master\r\n([#9564](https://github.com/AztecProtocol/aztec-packages/issues/9564))\r\n([747bff1](https://github.com/AztecProtocol/aztec-packages/commit/747bff1acbca3d263a765db82baa6ef9ca58c372))\r\n* Pass on docker_fast.sh\r\n([#9615](https://github.com/AztecProtocol/aztec-packages/issues/9615))\r\n([1c53459](https://github.com/AztecProtocol/aztec-packages/commit/1c53459ff31b50ba808e204c532885c9b0f69e39))\r\n</details>\r\n\r\n---\r\nThis PR was generated with [Release\r\nPlease](https://github.com/googleapis/release-please). See\r\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2024-11-01T13:15:40Z",
          "tree_id": "75aca90499f75bb6e0e9c64422b073b9332c3874",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/edf6389a783250e5684c5ddd3ec3757623b5b770"
        },
        "date": 1730468548182,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29214.508819999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27311.776846999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5386.216499,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5007.354811 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86212.955758,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86212958000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15172.894134,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15172894000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2498947591,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2498947591 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127818611,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127818611 ns\nthreads: 1"
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
          "id": "b98e93f4befb985c72e8768f378face2dcc79810",
          "message": "feat: Faster randomness sampling for field elements (#9627)\n\nChanges the algorithm for converting uint512_ts to fields. The result is\r\nequivalent (we can make an even faster version, but without the\r\nequivalence). 1.5x faster on the mainframe, 5x in wasm\r\nBefore. Native\r\n\r\n![image](https://github.com/user-attachments/assets/6314999c-b32e-402a-a2f4-a6829c08be59)\r\nAfter. Native:\r\n\r\n![image](https://github.com/user-attachments/assets/5a3d46ee-2a36-4a2d-8f4c-109dcd4eb496)\r\n\r\nBefore. Wasm:\r\n\r\n![image](https://github.com/user-attachments/assets/e7cf2c94-0a79-4dfb-9141-6d73c061c269)\r\n\r\n\r\nAfter. Wasm:\r\n\r\n![image](https://github.com/user-attachments/assets/06c05002-d3fc-4b22-ac93-68f8939708db)",
          "timestamp": "2024-11-01T13:25:27Z",
          "tree_id": "3668edf9f1ea19e95f1971033e3467cc1fe92952",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b98e93f4befb985c72e8768f378face2dcc79810"
        },
        "date": 1730470245386,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29061.564850999985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27692.211099 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5354.980000999987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5062.612838999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86240.890573,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86240893000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15165.42334,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15165424000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2506227079,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2506227079 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127307488,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127307488 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "aakoshh@gmail.com",
            "name": "Akosh Farkash",
            "username": "aakoshh"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "d2a84c405291b5a04576c133b0e74327d9092db1",
          "message": "chore!: Remove `recursive` from ACIR format; add them to API and CLI (#9479)\n\nResolves https://github.com/noir-lang/noir/issues/6185\r\n\r\n* Remove the `recursive` field from ACIR formats and the `Circuit`\r\ndefinition\r\n* Add `--recursive` to `bb` CLI\r\n* Add `recursive` to `main.ts`, the backend API and Wasm\r\n\r\nThis is effectively undoing a lot of what was done\r\n[here](https://github.com/AztecProtocol/aztec-packages/commit/9c965a7c9e652dfeaba2f09152e5db287407473d#diff-2b9fe3a6f248b96aefc37782cc4c321567eed5dd10ab24472620a68c0fb4506bR29).\r\nInterestingly there many more Wasm methods that need the `recursive`\r\nparameter now: whereas previously only `acir_create_proof` and\r\n`acir_verify_proof` used it, now anything that calls `create_circuit`\r\nneeds it because circuit creation builds all the constraints already,\r\nwhich depend on this.\r\n\r\nTODO:\r\n- [x] Remove the `#[recursive]` attribute from Noir\r\n- [x] Should the \"prove and verify\" methods that return nothing have a\r\nrecursive parameter?\r\n- [x] Remove `#[recursive]` from `noir-protocol-circuits`\r\n- [x] Update `bb-prover` where it uses uses `noir-protocol-circuits` to\r\nuse the correct `recursive` flag\r\n- [x] Add `--recursive` to `cli.ts` under `bb-prover`\r\n- [x] Check all calls to `executeBB` and pass `--recursive` if it calls\r\na `bb` command that needs it\r\n\r\n---------\r\n\r\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>\r\nCo-authored-by: Tom French <tom@tomfren.ch>",
          "timestamp": "2024-11-01T19:58:00Z",
          "tree_id": "9be19d37b0941b763219f85bcd53ec9b720ce4d1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d2a84c405291b5a04576c133b0e74327d9092db1"
        },
        "date": 1730492756523,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29166.27423700001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27761.464621000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5401.584049999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5093.1545510000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86413.061053,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86413063000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15172.872389999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15172872000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2509396337,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2509396337 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128267024,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128267024 ns\nthreads: 1"
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
          "id": "969a3f0b2d5bbce95126685b1a056f378a4c4d78",
          "message": "feat: Faster random sampling (#9655)\n\n169x in Native, 35x in wasm sampling of field elements",
          "timestamp": "2024-11-01T21:18:09Z",
          "tree_id": "d0d66f79949e4ea071fe1e8e7f914d1beace9ff0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/969a3f0b2d5bbce95126685b1a056f378a4c4d78"
        },
        "date": 1730498290411,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28879.06431800002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27395.250540999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5334.507876000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5000.309511 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86901.005033,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86901007000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15096.093248,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15096093000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2489300549,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2489300549 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 129009344,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 129009344 ns\nthreads: 1"
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
          "distinct": true,
          "id": "eeea55a39e9e1a417ddf79e44575420e5efcdfcf",
          "message": "feat: Graph methods for circuit analysis (part 1) (#7948)\n\nBoomerang value detection in ultra circuits not using poseidon and auxiliary gates",
          "timestamp": "2024-11-01T22:12:40Z",
          "tree_id": "d84eca74b446d7955ac985a9ce2d2a7657516eb6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/eeea55a39e9e1a417ddf79e44575420e5efcdfcf"
        },
        "date": 1730501487330,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29098.635255000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27514.23919 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5416.658995000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5028.363216 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86395.639096,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86395641000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15122.528201000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15122529000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2508856167,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2508856167 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128820449,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128820449 ns\nthreads: 1"
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
          "id": "bf5d62d4332548ac7798085eb98cedea88131d9d",
          "message": "fix: Fix random for Mac users  (#9670)\n\nmac doesn't have the getrandom function, but should have getentropy",
          "timestamp": "2024-11-01T23:55:39Z",
          "tree_id": "c743ec86ba0ce09eedfe24bdf922234d562612e8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/bf5d62d4332548ac7798085eb98cedea88131d9d"
        },
        "date": 1730507657103,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29116.83140400001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27660.086187 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5356.66767299999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5019.157957 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86168.13288199999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86168135000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15138.582226999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15138581000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2504777062,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2504777062 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126619204,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126619204 ns\nthreads: 1"
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
          "id": "4fc6f8b44b7e58d982151732fa6d9691e73635bc",
          "message": "chore: redo typo PR by dsarfed (#9667)\n\nThanks dsarfed for\r\nhttps://github.com/AztecProtocol/aztec-packages/pull/9654. Our policy is\r\nto redo typo changes to dissuade metric farming. This is an automated\r\nscript.\r\n\r\n---------\r\n\r\nCo-authored-by: dsarfed <d.p.casm@gmail.com>\r\nCo-authored-by: ludamad <adam.domurad@gmail.com>",
          "timestamp": "2024-11-01T21:49:23-04:00",
          "tree_id": "25759109fb10f8dc26073c8f383dd6d756aa3a42",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4fc6f8b44b7e58d982151732fa6d9691e73635bc"
        },
        "date": 1730513539522,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29066.328510000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27184.776768 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5357.084838999981,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5046.455019 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85041.12944699998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85041132000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15206.350716,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15206351000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2494562742,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2494562742 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127477506,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127477506 ns\nthreads: 1"
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
          "id": "1a41d42852ea2d7cdcb9f75387342783e1632b11",
          "message": "feat: Encode static error strings in the ABI (#9552)\n\nAvoids embedding revert string in circuits. Instead, static string\r\nerrors get a specific selector, and they are encoded in the ABI. We use\r\nnoir_abi to resolve those messages in the error case.\r\n\r\n---------\r\n\r\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2024-11-04T10:51:26+01:00",
          "tree_id": "b2a643b246444d2efd81eea9d8e149500e4cec7b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1a41d42852ea2d7cdcb9f75387342783e1632b11"
        },
        "date": 1730715464314,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29042.35773900001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27261.634533000004 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5338.293532000009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4969.760267000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85756.479286,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85756482000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15192.176764,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15192176000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2489617799,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2489617799 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125309097,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125309097 ns\nthreads: 1"
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
          "id": "dedbe402640c13cfa1ec4198f35caaeb4d27e929",
          "message": "chore: redo typo PR by leopardracer (#9705)\n\nThanks leopardracer for\r\nhttps://github.com/AztecProtocol/aztec-packages/pull/9700. Our policy is\r\nto redo typo changes to dissuade metric farming. This is an automated\r\nscript.\r\n\r\nCo-authored-by: Tom French <tom@tomfren.ch>",
          "timestamp": "2024-11-04T10:49:08Z",
          "tree_id": "dd5f4348fdf079f27420d080506f3637f805380e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/dedbe402640c13cfa1ec4198f35caaeb4d27e929"
        },
        "date": 1730718562470,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29090.758538999977,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27289.702443 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5334.509251000014,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5011.096837 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86175.94695,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86175948000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15226.740174999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15226741000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2483381777,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2483381777 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126815731,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126815731 ns\nthreads: 1"
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
          "id": "29724f3f2db5a3b6e399e54a9a84af8686807fb6",
          "message": "feat(avm)!: byte indexed PC (#9582)\n\nThis PR moves the AVM to use byte-indexed PCs\n* Modifies the transpiler to remap brillig PCs\n* Modifies the simulator to use byte indexed PCs\n* Modifies witgen and circuit to use byte indexed PCs\n\nWhy are we doing this?\n* Needed for bytecode decomposition in the circuit.\n* Allow storing other stuff besides code in a contract, and then be able to use it in memory with an opcode \"CODECOPY\" or similar.\n\n---\n\nA note on how PCs are mapped in the transpiler: we do 2 passes. First we translate all instructions and leave brillig location operands as `BRILLIG_LOCATION`. On a second pass, since now we know the structure of the program and the brillig=>AVM pcs, we replace those.\n\nThere are a few big caveats\n1. ~Since the JUMP(I) and INTERNALCALL operands are U16, we cannot jump or call a location bigger than 2^16. This effectively constrains the contract size to 65kB.~ We use 32 bit jumps now.\n2. We can do the transformation in (only) 2 passes because we only have 1 variant of JUMP etc. Suppose we had an 8 bit variant, or a 32 bit variant, then we wouldn't know which one to use until the original PC has been mapped, but that itself can change the size of the instructions and trigger a remapping!\n\nSolutions?\n* For (1) I might propose having relative jumps JUMP(I)R with 8 and 16 bit variants, and an absolute JUMP with 32 bits.\n* For (2) we might just need to remap until there is no change.\n\nPart of #9059.",
          "timestamp": "2024-11-04T15:39:43Z",
          "tree_id": "bcd4ea9a7f7111839762c52d05ad28fb4d0c6db1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/29724f3f2db5a3b6e399e54a9a84af8686807fb6"
        },
        "date": 1730736364670,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29020.685466000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27539.080553 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5353.214475999991,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5042.800747 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85778.77153299999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85778774000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15085.014893,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15085015000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2495160654,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2495160654 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126926626,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126926626 ns\nthreads: 1"
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
          "id": "76328ebe88fd1d9dbb041be8cc1692516ed7d2d2",
          "message": "feat: track active accumulator rows and leverage in IVC folding (#9599)\n\nIf the IVC accumulator does not make use of the full capacity of a given\r\nblock, there will be some number of unused/empty rows at the end of the\r\nblock. We have a mechanism to skip performing relation work at such rows\r\nbut we sometimes still perform relatively expensive operations like\r\n`get_row()` on them. This additional overhead can become very\r\nsignificant if the total accumulator content is much smaller than the\r\nstructured trace size. We can avoid a lot of unnecessary work on these\r\nempty rows by tracking the \"active ranges\" of the execution trace, i.e.\r\nthe regions of the accumulator which correspond to non-zero relation\r\ncontributions.\r\n\r\nThis PR introduces a class `ExecutionTraceUsageTracker` for tracking the\r\nactive regions of the accumulator and computing efficient distribution\r\nof the execution trace rows according to actual content in the\r\nmultithreading context. This logic is leveraged in the combiner and\r\nperturbator computations but can potentially be introduced in other\r\nplaces as well.\r\n\r\nSome high level numbers for the current benchmark case but with the 2^19\r\ncircuit replaced with another 2^17 circuit (i.e. ~2^17 worth of content\r\nin a 2^19 ambient trace)\r\n\r\nMaster:\r\n```\r\nClientIVCBench/Full/6      27137 ms        23345 ms\r\n\r\ncompute_combiner(t)                     5826   22.12%\r\ncompute_perturbator(t)                  2295    8.71%\r\n```\r\n\r\nBranch:\r\n```\r\nClientIVCBench/Full/6      23247 ms        21532 ms\r\n\r\ncompute_combiner(t)                     2804   12.49%\r\ncompute_perturbator(t)                  1522    6.78%\r\n```",
          "timestamp": "2024-11-04T13:43:50-07:00",
          "tree_id": "fa3e3024a8e97eeb035328d8964d6358912c2efe",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/76328ebe88fd1d9dbb041be8cc1692516ed7d2d2"
        },
        "date": 1730754623864,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28490.763504,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27135.315661 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5322.7271650000175,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4954.578381 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83361.85947200001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83361861000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15226.426286999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15226427000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2506871906,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2506871906 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 129457965,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 129457965 ns\nthreads: 1"
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
          "id": "1a935d091cfad0e4861ec840a59372fdf177518d",
          "message": "feat: IPA Accumulation implementation (#9494)\n\nAdds new functions to the IPA class that accumulate two IPA claims in\r\ncircuit, and does prover work to prove new accumulated IPA claim.\r\n\r\nAlso adds new tests for IPA recursion. The new RecursiveSmall test\r\nallowed us to find a subtle bug in IPA where one value was not being\r\nnegated, leading to an incorrect identity. This was not caught\r\npreviously because this value, the evaluation, was always 0 in the\r\nexisting tests, as Shplonk always sets it to 0.",
          "timestamp": "2024-11-04T21:21:42Z",
          "tree_id": "f937b36073a84d8645cdf4f4df3b0a7ec0843ce6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1a935d091cfad0e4861ec840a59372fdf177518d"
        },
        "date": 1730757644650,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28611.32545799998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27217.204361 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5346.0542790000145,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5044.609014 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83664.27564600001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83664278000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15115.154873,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15115154000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2481250970,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2481250970 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127502136,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127502136 ns\nthreads: 1"
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
          "id": "1779c42c3dfed9a1d433cd0c6f8400a14612e404",
          "message": "chore(docs): authwit note, not simulating simulations (#9438)\n\nAdds notes to the docs that indicate that authwits only work in single\r\nplayer mode, describes the problems with not simulating simulations, and\r\nupdates the bberg readme install instructions\r\n\r\ncloses https://github.com/AztecProtocol/dev-rel/issues/422\r\ncloses https://github.com/AztecProtocol/dev-rel/issues/433\r\ncloses https://github.com/AztecProtocol/aztec-packages/issues/9256\r\ncloses https://github.com/AztecProtocol/dev-rel/issues/423\r\ncloses https://github.com/AztecProtocol/aztec-packages/issues/6865",
          "timestamp": "2024-11-05T14:53:03Z",
          "tree_id": "00f67e9c21790c0d17ddec54ff723e4c65a5ea40",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1779c42c3dfed9a1d433cd0c6f8400a14612e404"
        },
        "date": 1730820024474,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28622.92541100001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26978.376987999996 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5414.052170999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5119.403296 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83804.73116899999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83804734000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15126.040959999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15126040000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2493345289,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2493345289 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128300439,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128300439 ns\nthreads: 1"
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
          "id": "d7ee6e5cffba32ef141e717aeaf83f56a9af92b5",
          "message": "feat: recursive verifier for decider and last folding proof (#9626)\n\nConstruct the _hiding_ circuit, which recursively verifies the last\r\nfolding proof and the decider proof in Client IVC and amend the e2e\r\nprover accordingly. The ClientIVC proof becomes a mega proof for the\r\nhiding circuit and a goblin proof which simplifies the work required to\r\ntransform this in a zero knowledge proof.",
          "timestamp": "2024-11-05T17:46:52Z",
          "tree_id": "74adc6396dd0a9021d0d14f5c6d565e7de0dd938",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d7ee6e5cffba32ef141e717aeaf83f56a9af92b5"
        },
        "date": 1730830462829,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29714.081709999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27804.966084 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5329.58219599999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4987.222974 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 88247.460294,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 88247463000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15040.724782999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15040725000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3035963802,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3035963802 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 145350192,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 145350192 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "wraitii@users.noreply.github.com",
            "name": "Lancelot de Ferrière",
            "username": "wraitii"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "047a96431f7f34f16fa1ad6cb21e652645378d93",
          "message": "Rename DISABLE_TBB flag and disable on MacOS by default (#9747)\n\nPer #9746 , mac os compilation on ARM fails by default because of\r\n`std::execution::par_unseq`.\r\n\r\nThis PR fixes that by explicitly disabling it on MacOS since apple clang\r\ndoesn't support it. There's probably a better plug somewhere but I'm not\r\nultra-familiar with how you setup the build system, should this be a\r\npreset, should this be based on apple-clang specifically, etc. Can adapt\r\nthe PR as needed.\r\n\r\nI also rename DISABLE_TBB here because it seems to me that this should\r\nbe part of the native C++20 support on other platforms, but I have to\r\nadmit I'm really unfamiliar with the details here and I'm not sure if\r\nintel TBB is needed, or indeed what it does exactly. Can cut this from\r\nthe PR.\r\n\r\nLikewise, this turns parallel algorithms ON by default on the same C++20\r\nassumption, but that could well not work.",
          "timestamp": "2024-11-05T14:14:13-05:00",
          "tree_id": "9a600aa0a879b587fb52cb20fd98819c85f3410f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/047a96431f7f34f16fa1ad6cb21e652645378d93"
        },
        "date": 1730836209872,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29834.218410999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27822.74104 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5390.001780000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4985.522631 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 88529.81214400001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 88529814000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15196.312047000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15196313000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3028439701,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3028439701 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 143016636,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 143016636 ns\nthreads: 1"
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
          "id": "c95e5fd5606b7f14b1e2e43ecc770d5f22d294a0",
          "message": "feat: constify eccvm and translator (#9661)\n\nMakes the proof size of ECCVM constant by making the sumcheck gate\r\nchallenges and IPA constant.\r\nFixes the ECCVM recursive verifier size (besides the MSM in the IPA\r\nRecursive verifier) as a result.\r\n\r\nCloses https://github.com/AztecProtocol/barretenberg/issues/1009.",
          "timestamp": "2024-11-07T00:38:15Z",
          "tree_id": "47904449d423103db6c7d9916d08c11be481026d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c95e5fd5606b7f14b1e2e43ecc770d5f22d294a0"
        },
        "date": 1730941845213,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29939.250129999975,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28122.691898 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5468.394803000009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5100.773519999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 89269.495561,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 89269498000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15324.819712,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15324820000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3065985947,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3065985947 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141622772,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141622772 ns\nthreads: 1"
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
          "id": "f1cdc2d981ef01fda9b14c6803e014e546b71b66",
          "message": "feat: prove openings of masking polynomials in ECCVM and Translator (#9726)\n\nAs a part of ZK-fication of Honk, we have to mask the evaluations of\r\nround univariates that the prover sends to the verifier. The evaluations\r\nwere masked in Sumcheck in PR #7517. However, the logic for proving\r\nevaluations of Libra masking polynomials was missing. This PR fixes this\r\nissue and enables efficient batch opening of these polynomials.\r\n* Added necessary logic to Shplonk Prover, Shplemini Prover, and\r\nShplemini Verifer\r\n* Better handling of the ZKSumcheckData\r\n* Removed methods and reverted changes that became obsolete because of\r\nthe new ZK strategy\r\n* Enabled the opening of Libra masking univariates in ECCVM and\r\nTranslator",
          "timestamp": "2024-11-07T13:49:28+01:00",
          "tree_id": "6db3c13447821efa49b81958acc6d748664aa722",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f1cdc2d981ef01fda9b14c6803e014e546b71b66"
        },
        "date": 1730987662007,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28969.964099000008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27196.955198 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5355.7751499999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5045.276693 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84466.67342,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84466675000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15143.665224999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15143665000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3028019317,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3028019317 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142482395,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142482395 ns\nthreads: 1"
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
          "id": "ae7cfe72b5c528fb533040c6da62c9b21f542f8b",
          "message": "feat: Constrain App function VKs (#9756)\n\nResolves https://github.com/AztecProtocol/aztec-packages/issues/9592\r\n - Now contract artifacts must have VKs in their private functions\r\n- aztec-nargo inserts the verification keys after public function\r\ntranspilation\r\n - We no longer derive any VK in the TX proving flow\r\n - App VKs are now constrained in the private kernels\r\n - Bootstrap generates VKs for all apps (with s3 caching)\r\n- PXE is currently accepting any VK present in the artifact as valid: we\r\nshould explore the correct interface for this in the future and wether\r\nPXE can use those VKs without rederiving them from ACIR",
          "timestamp": "2024-11-07T15:50:24+01:00",
          "tree_id": "e9edc777ef9b34bdddfdb350b69df91183410e99",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ae7cfe72b5c528fb533040c6da62c9b21f542f8b"
        },
        "date": 1730992603297,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29125.051237000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27334.133822000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5407.657706000009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5114.600949 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85774.64096400002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85774642000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15354.471928,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15354472000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3031771018,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3031771018 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 144134174,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 144134174 ns\nthreads: 1"
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
          "id": "d77e473219d1628b2045100a55c4073f9fa32c25",
          "message": "feat: Origin Tags part 3 (Memory) (#9758)\n\nThis PR:\r\n1. Adds Origin Tags for tracking dangerous interactions to all stdlib\r\nmemory primitives\r\n2. Expands  the tests from TwinRomTable\r\n3. Fixes a bug with the use of nonnormalized value.",
          "timestamp": "2024-11-07T17:01:08Z",
          "tree_id": "8e12e5f17236c375fdbaf23660cd5ee3fe7fb500",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d77e473219d1628b2045100a55c4073f9fa32c25"
        },
        "date": 1731000699105,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29103.202828999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27223.105461 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5404.776381000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5021.919111000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84476.774951,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84476778000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15177.788907000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15177789000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3079377835,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3079377835 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 144600039,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 144600039 ns\nthreads: 1"
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
          "id": "46603810b149ef7f03c220d11d6dfd395cf550e0",
          "message": "feat: introduce avm circuit public inputs (#9759)",
          "timestamp": "2024-11-07T19:14:13Z",
          "tree_id": "45f1042bf52906b72284a9d7eb1935fde8c26dac",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/46603810b149ef7f03c220d11d6dfd395cf550e0"
        },
        "date": 1731008467145,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29188.23021200001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27286.503976000004 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5398.220129999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5037.958326 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84802.44103599999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84802443000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15251.909859000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15251910000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3074022966,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3074022966 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 146405492,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 146405492 ns\nthreads: 1"
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
          "id": "0ebd52e5dd326fcbebe38869908dfcb4c2ba2c03",
          "message": "chore: rename aggregation object to pairing point accumulator (#9817)\n\nRenames aggregation object/recursive proof to pairing point accumulator,\r\nso its not confusing with introduction of the IPA accumulator.",
          "timestamp": "2024-11-07T23:39:38-05:00",
          "tree_id": "53ef72e4d45e268458f2ada63576e77c7ff87c00",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0ebd52e5dd326fcbebe38869908dfcb4c2ba2c03"
        },
        "date": 1731042416321,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29056.599215000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27452.107747 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5378.682103999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4964.83385 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84033.011787,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84033013000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15202.014919999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15202015000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3055229967,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3055229967 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 144531751,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 144531751 ns\nthreads: 1"
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
          "id": "2096dc236c627cfd802ca05e0c9cb0ea6c441458",
          "message": "feat: mega zk features (#9774)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\r\nline.",
          "timestamp": "2024-11-08T11:02:04Z",
          "tree_id": "a888823ffdf63573a624ef8b4da9fa01c7708dcd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2096dc236c627cfd802ca05e0c9cb0ea6c441458"
        },
        "date": 1731065650306,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28950.799380000008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27114.458366000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5326.826313999987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5027.111476 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83631.167586,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83631169000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15102.462676,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15102463000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3031255832,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3031255832 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 143518782,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 143518782 ns\nthreads: 1"
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
          "id": "9bc5a2f02852d6187a597612e8459ee305f3e198",
          "message": "feat: send G_0 in proof to reduce tube size (#9766)\n\nRemoves the G^0 MSM computation from the recursive verifier and instead\r\nincludes it in the proof.\r\n\r\nAdds test to ensure that IPA recursive verifier is a fixed circuit no\r\nmatter the ECCVM size.\r\n\r\nFor the command: `FLOW=prove_then_verify_tube ./run_acir_tests.sh\r\nfold_basic`, which has 6 circuits:\r\nTube gates before constification and before MSM removal: 7104756\r\nTube gates after: 4172057\r\n\r\nFor the ClientTubeBase test with 8 circuits, we see:\r\nTube before: 10047313\r\nTube gates after: 4172057",
          "timestamp": "2024-11-08T17:19:56Z",
          "tree_id": "07cf9d21739c6b59f9ada7f035a7212c4a667a17",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9bc5a2f02852d6187a597612e8459ee305f3e198"
        },
        "date": 1731088151813,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29085.58440500002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27432.566016000004 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5362.79236,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5051.22747 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84704.85629000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84704858000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15168.484659000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15168484000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3061653904,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3061653904 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 143607197,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 143607197 ns\nthreads: 1"
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
          "id": "90696cd0e126d7db3c4ef396ada4bddd3ac0de73",
          "message": "feat: bb.js tests of ClientIVC (#9412)\n\nExtend the ivc-integration-tests suite to execute tests through the\r\nwasm and the browser. When run, these tests give both memory and time logs. We should\r\nmake these easier to read, but for now they're very useful.",
          "timestamp": "2024-11-08T17:44:33Z",
          "tree_id": "5783a8e3d0c33cf1924d0f1e33e34b7048c61f68",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/90696cd0e126d7db3c4ef396ada4bddd3ac0de73"
        },
        "date": 1731090058955,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29166.603784000017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27448.519479 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5350.589461999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5013.155016 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84217.63666399999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84217637000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15210.690980000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15210692000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3068862398,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3068862398 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 144145031,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 144145031 ns\nthreads: 1"
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
          "id": "23ff5186a4c8905bd35753c1e6536d3b5504a5f0",
          "message": "feat: zk shplemini (#9830)\n\nWe achieve ZK in Shplemini as follows. Before batching the multilinear\r\nevaluation claims obtained as the sumcheck output, the Gemini prover\r\n* creates a random polynomial M of the circuit size;\r\n* commits to M using KZG/IPA, sends the commitment to the verifier;\r\n* evaluates M at the sumcheck challenge, sends the evaluation to the\r\nverifier.\r\n\r\nThe verifier simply adds this new commitment and the appropriate scalar\r\nmultiplier to the BatchOpeningClaim.",
          "timestamp": "2024-11-08T19:27:30Z",
          "tree_id": "b5a588d61a6a359ca110cade852f5bbac1c781cd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/23ff5186a4c8905bd35753c1e6536d3b5504a5f0"
        },
        "date": 1731096043211,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29338.99260800001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27494.75631 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5394.35410900002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4997.728759000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85229.531745,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85229533000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15295.763227,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15295765000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3143603202,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3143603202 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 146374702,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 146374702 ns\nthreads: 1"
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
          "id": "9978c9742c7b2b27c9ba813ddb66125a0ca57e6b",
          "message": "fix: Fix mac build by calling `count` on durations (#9855)\n\nWe can print `std::chrono` durations our usual PR test builds but not on\r\nmac. Should fix the mac build if this is the only issue.",
          "timestamp": "2024-11-08T14:50:47-05:00",
          "tree_id": "72ff24fcc8bb626ec0b15f2c3caab844d0aa0fe2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9978c9742c7b2b27c9ba813ddb66125a0ca57e6b"
        },
        "date": 1731097470773,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29200.477396999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27328.013704 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5364.017490999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5049.377902000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85561.04518799999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85561046000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15278.799444999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15278801000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3103869811,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3103869811 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 145279080,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 145279080 ns\nthreads: 1"
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
          "id": "23c122d36091b3b756084584ecba59b800196d58",
          "message": "fix: tree heights that last past 3 days (#9760)\n\nThe L1-L2 message tree height was a bottleneck running \r\n```\r\npost-mortem of 1-validator network (bot set to 0.05 TPS, 1 private / 2 public transfers per tx)\r\nLasted long, got to block 4091, last tried to propose block 4097\r\nHit issues and did not reorg past them\r\nRoot issue (guess):\r\n2024-11-05 08:32:53.148\tError assembling block: 'Error: Failed to append leaves: Tree is full'\r\n```\r\nAlso updated tree heights with constants proposed by @iAmMichaelConnor\r\nhere (https://github.com/AztecProtocol/aztec-packages/issues/9451)\r\n(thanks for the thoughtful analysis I could lazily steal!\r\nAutomated test is a bit awkward here or I'd write one. It'd either\r\ntrivially pass or have to go through 3-days worth of transactions.",
          "timestamp": "2024-11-08T18:07:54-05:00",
          "tree_id": "717c13b8c0bf4ff4d68f3ea9a779308514765576",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/23c122d36091b3b756084584ecba59b800196d58"
        },
        "date": 1731109316584,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29099.553415000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27115.808192000004 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5365.781077999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5025.194563999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84549.91017500001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84549912000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15084.447399000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15084448000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3111354952,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3111354952 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 143330783,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 143330783 ns\nthreads: 1"
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
          "id": "ada3e3aba6141411a8ca931f45cc2b9b7027585e",
          "message": "feat(avm): mem specific range check (#9828)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\r\nline.",
          "timestamp": "2024-11-11T10:57:15Z",
          "tree_id": "b72f2e4182152f6fd5ce013d26d6d63e62606520",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ada3e3aba6141411a8ca931f45cc2b9b7027585e"
        },
        "date": 1731325174204,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29082.425795000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27200.003416 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5412.617542000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5057.10957 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84928.89053900001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84928892000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15122.277098999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15122278000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3138671870,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3138671870 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 145685610,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 145685610 ns\nthreads: 1"
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
          "id": "b6216033b567e0d743e17c37754a20f9c893aa0e",
          "message": "fix: fix bad merge (#9892)",
          "timestamp": "2024-11-11T17:35:20Z",
          "tree_id": "9fb50fcd79e0e2f100d5a1b67358ed4f592bed71",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b6216033b567e0d743e17c37754a20f9c893aa0e"
        },
        "date": 1731348859348,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28872.60325699998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27152.669127 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5330.3856,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5042.051134 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84982.542073,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84982543000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15149.257878000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15149259000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3110753920,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3110753920 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 144173219,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 144173219 ns\nthreads: 1"
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
          "id": "52ae4e1710d07aca497de723294f7b7c0100b479",
          "message": "feat: Stop with HeapVector (#9810)\n\nUpdates the Brillig stop opcode to return a HeapVector (pointer +\r\ndynamic size). Also changes the transpiler, simulator and witness gen of\r\nthe AVM to support it.",
          "timestamp": "2024-11-12T10:48:00+01:00",
          "tree_id": "803e7af38f86d95af4f08cec3ac224d3ca1c2e33",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/52ae4e1710d07aca497de723294f7b7c0100b479"
        },
        "date": 1731406229347,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29101.755018000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27303.958217000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5378.694405000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5080.480593000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85260.90027400001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85260901000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15206.629582,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15206629000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3121214461,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3121214461 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 143752589,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 143752589 ns\nthreads: 1"
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
          "id": "1a9c5ce385c7db2e488831dcd7dc3bedfc02f74a",
          "message": "feat(avm): gas specific range check (#9874)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\r\nline.",
          "timestamp": "2024-11-12T10:01:24Z",
          "tree_id": "3bf40be615053456e2f14363e1fd7861eb12b7ab",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1a9c5ce385c7db2e488831dcd7dc3bedfc02f74a"
        },
        "date": 1731407722850,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28905.950902,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27187.59208 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5392.083714999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5059.772726 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84732.686959,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84732688000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15115.169393,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15115170000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3108480080,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3108480080 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 144336356,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 144336356 ns\nthreads: 1"
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
          "id": "abdd912bd0d3cf9a8e09339a3766c61eea712ede",
          "message": "fix(avm): derive unencrypted log in test (#9813)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\r\nline.",
          "timestamp": "2024-11-12T14:26:53+01:00",
          "tree_id": "8fb30133b6d36748b1d0e6f7f22c3bd685bd9cec",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/abdd912bd0d3cf9a8e09339a3766c61eea712ede"
        },
        "date": 1731419474640,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28854.566656999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27154.555409 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5358.253938000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5053.039269 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84257.61815400001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84257619000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15180.245385,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15180247000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3096817133,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3096817133 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 143701329,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 143701329 ns\nthreads: 1"
          }
        ]
      }
    ]
  }
}