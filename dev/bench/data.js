window.BENCHMARK_DATA = {
  "lastUpdate": 1730320306772,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "C++ Benchmark": [
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
          "id": "1c008d9a2fad747142e8ca356d6c00cee1663f2c",
          "message": "feat: Tracy time with instrumentation (#9170)\n\nAt scripts for profiling locally with tracy and samply, add\r\ninstrumentation so that tracy profile is pretty complete, and combine\r\nBB_OP_COUNT macros with tracy macros.",
          "timestamp": "2024-10-11T23:11:55Z",
          "tree_id": "73ea0f6f399ec5ae1fd507ab7784445b9a0edea0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1c008d9a2fad747142e8ca356d6c00cee1663f2c"
        },
        "date": 1728690137382,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29534.589775,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28072.185873000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5528.562555999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5233.683983000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86053.945606,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86053947000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15534.235607999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15534235000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2792561611,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2792561611 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127901215,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127901215 ns\nthreads: 1"
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
          "id": "80ea32cfda8c149980938382518c47a6da123e72",
          "message": "fix: mac-build (#9216)\n\nfix mac build issues with emplace back",
          "timestamp": "2024-10-12T15:52:58+01:00",
          "tree_id": "137906381e8599ed68ece91e5ad570a3243d76e9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/80ea32cfda8c149980938382518c47a6da123e72"
        },
        "date": 1728746167426,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29618.566467000022,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27895.605439 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5518.821794000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5217.721629 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86548.20175899999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86548204000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15583.017112000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15583017000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2801559134,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2801559134 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126363947,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126363947 ns\nthreads: 1"
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
          "id": "c857cd9167f696fc237b64ff579952001eba7d40",
          "message": "feat: Replace Zeromorph with Shplemini in ECCVM (#9102)\n\nThis PR switches ECCVM to Shplemini which shaves off ~300k in the tube\r\ncircuit. Now, on the verifier side, we first execute Shplemini, then\r\nreduce the BatchOpeningClaim to a single OpeningClaim by performing the\r\nbatch_mul delayed by Shplemini. Then, we construct the translation\r\nOpeningClaim, and the two are being reduced to a single OpeningClaim by\r\nexecuting a second iteration of Shplonk. Finally, we verify the\r\nOpeningClaim via PCS. This could be further optimised as we currently\r\nperform 4 batch_muls.",
          "timestamp": "2024-10-15T09:47:16+01:00",
          "tree_id": "bb565a572a53cf1ac2db289bcb0be0a8a5c229a0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c857cd9167f696fc237b64ff579952001eba7d40"
        },
        "date": 1728985025455,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29604.541609999986,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28114.01506 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5500.81342899999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5204.295326 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 87391.325026,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 87391327000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15521.631061999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15521632000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2843649671,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2843649671 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126839075,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126839075 ns\nthreads: 1"
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
          "id": "a306ea5ffeb13019427a96d8152e5642b717c5f6",
          "message": "fix: Reduce SRS size back to normal (#9098)\n\nResolves https://github.com/AztecProtocol/barretenberg/issues/1097.\r\n\r\nPreviously, we had to bump up SRS sizes to 1.5x the dyadic circuit size\r\nbecause structured polynomials meant that we could commit starting from\r\nthe start_index of the polynomial, but because pippenger likes a power\r\nof 2 points, that meant that we sometimes exceeded the\r\ndyadic_circuit_size during a roundup to a power of 2.\r\n\r\nThis PR fixes this by using PolynomialSpans to store the scalars. Note\r\nthat these scalars do not necessarily represent polynomials anymore, so\r\nmaybe this object can be renamed. The PolynomialSpan allows us to store\r\na start_index with the scalars, where the start_index here means the\r\noffset into the span of points that the scalars start at. For example,\r\nif we are committing to a polynomial which starts at index 13, and has\r\n13 length. The points we will use will now be [10, 26) instead of [13,\r\n29) previously. The start_index here would be 3 because the scalars\r\nstart at 13, which is 3 after the points start.\r\n\r\nThe range for the points is chosen to the be the earliest power of 2\r\nwindow that fits the scalars, meaning we try to shift it as left as\r\npossible. This means that will never exceed the dyadic_circuit_size as a\r\nresult, so we can keep the old (and good) SRS sizes.",
          "timestamp": "2024-10-15T17:17:38Z",
          "tree_id": "ef19d62029020b54fd1da6758cd3f4dc32573a3f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a306ea5ffeb13019427a96d8152e5642b717c5f6"
        },
        "date": 1729014352241,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29513.839836999978,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27760.377947 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5389.744848000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5061.229837999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 87124.68346500001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 87124686000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15195.443389000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15195442000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2719181079,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2719181079 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127244347,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127244347 ns\nthreads: 1"
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
          "id": "8b2d7d9c962c975592e17424f4d0b70f9ca7acd4",
          "message": "fix(s3-cache): link extracted preset-release-world-state (#9252)",
          "timestamp": "2024-10-16T11:14:16Z",
          "tree_id": "84f0bf5b2af72bbf6f1b09852492ee7b1955f021",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8b2d7d9c962c975592e17424f4d0b70f9ca7acd4"
        },
        "date": 1729078812582,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29695.218789000024,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27958.715777 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5422.575045000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5048.906808 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86870.473682,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86870475000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15351.412733000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15351412000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2744479692,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2744479692 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125757008,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125757008 ns\nthreads: 1"
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
          "id": "df3710477fc7d2e7c44e62b116bea74d4e14f930",
          "message": "fix: bb bootstrap_cache.sh (#9254)",
          "timestamp": "2024-10-16T11:58:23Z",
          "tree_id": "abdfc7f3ab1e038b4155f0c5814f67b5ba4adfb2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/df3710477fc7d2e7c44e62b116bea74d4e14f930"
        },
        "date": 1729081509305,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29615.027320999987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27705.862782 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5423.02547700001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5089.955362 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 87651.414865,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 87651417000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15165.702234999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15165702000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2742838117,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2742838117 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127327948,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127327948 ns\nthreads: 1"
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
          "id": "5861d4e5e8a72161dac910e0bc8e635e0d332793",
          "message": "feat!: Brillig and AVM default all uninitialized memory cells to Field 0 (#9057)\n\nResolves (at least partially)\r\nhttps://github.com/AztecProtocol/aztec-packages/issues/7341\r\n\r\n---------\r\n\r\nCo-authored-by: TomAFrench <tom@tomfren.ch>\r\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2024-10-17T18:47:04+01:00",
          "tree_id": "330b326523492992e2b19350574c8fcbfcea3ec6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5861d4e5e8a72161dac910e0bc8e635e0d332793"
        },
        "date": 1729189838219,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29460.31076700001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27434.260087 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5353.530108000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5020.622063 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 87407.416633,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 87407419000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15324.423383,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15324423000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2719566163,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2719566163 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127038151,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127038151 ns\nthreads: 1"
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
          "id": "17c612740dc3563321bf69c1760de1ef88b22124",
          "message": "feat: modify contract instance to include public keys (#9153)\n\nIn this PR we are doing the ground work for the new address scheme by\r\nmodifying the contract instance to include the full public keys instead\r\nof only the public keys hash. We need the full public keys because we\r\nneed to verify the preimage of the new address, which requires the ivpk,\r\nand we need to verify the ivpk's correctness by manually computing the\r\npublic keys hash.",
          "timestamp": "2024-10-17T16:45:12-05:00",
          "tree_id": "a808d71f357d7561b5ca75018984dab4d7d850c1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/17c612740dc3563321bf69c1760de1ef88b22124"
        },
        "date": 1729203069176,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29588.701966,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28107.555924 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5420.065596000015,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5075.373547000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 87251.83216800001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 87251834000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15297.473012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15297474000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2726524051,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2726524051 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126683570,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126683570 ns\nthreads: 1"
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
          "id": "1f0538f00cadcf4325d2aa17bdb098d11ca3840f",
          "message": "chore!: remove pedersen hash opcode (#9245)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\r\nline.",
          "timestamp": "2024-10-18T05:38:11-04:00",
          "tree_id": "d6fc7e9d951892750575baf0b68ef208cab4e08e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1f0538f00cadcf4325d2aa17bdb098d11ca3840f"
        },
        "date": 1729247542017,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29509.603806999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27869.237587 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5334.4843959999935,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4990.720297999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 87065.722212,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 87065724000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15141.100145,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15141100000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2693538079,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2693538079 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128809704,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128809704 ns\nthreads: 1"
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
          "id": "1823bde2b486827f33a87899074594f811cfbef4",
          "message": "chore!: remove pedersen commitment (#9107)\n\nThis PR removes the pedersen hash opcode as it's not currently possible\r\nto emit these from noir code.",
          "timestamp": "2024-10-18T11:06:13Z",
          "tree_id": "eedcded7ae80b859d3211ed13e00140dd0abc132",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1823bde2b486827f33a87899074594f811cfbef4"
        },
        "date": 1729252055172,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29434.572143999987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27923.794405999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5336.685785000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5015.803135 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86898.329668,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86898332000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15260.194918999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15260195000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2712013465,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2712013465 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125696237,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125696237 ns\nthreads: 1"
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
          "id": "ab0c80d7493e6bdbc58dcd517b248de6ddd6fd67",
          "message": "chore(master): Release 0.58.0 (#9068)\n\n:robot: I have created a release *beep* *boop*\r\n---\r\n\r\n\r\n<details><summary>aztec-package: 0.58.0</summary>\r\n\r\n##\r\n[0.58.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.57.0...aztec-package-v0.58.0)\r\n(2024-10-18)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* protocol contracts\r\n([#9025](https://github.com/AztecProtocol/aztec-packages/issues/9025))\r\n\r\n### Features\r\n\r\n* Modify contract instance to include public keys\r\n([#9153](https://github.com/AztecProtocol/aztec-packages/issues/9153))\r\n([17c6127](https://github.com/AztecProtocol/aztec-packages/commit/17c612740dc3563321bf69c1760de1ef88b22124))\r\n* Native tmux-based network e2e\r\n([#9036](https://github.com/AztecProtocol/aztec-packages/issues/9036))\r\n([f9fc73a](https://github.com/AztecProtocol/aztec-packages/commit/f9fc73a40f5b9d11ad92a6cee3e29d3fcc80425e))\r\n* Protocol contracts\r\n([#9025](https://github.com/AztecProtocol/aztec-packages/issues/9025))\r\n([f3bcff0](https://github.com/AztecProtocol/aztec-packages/commit/f3bcff0c0943d190261de366301ed8f9267543f3))\r\n* World state synchronizer reorgs\r\n([#9091](https://github.com/AztecProtocol/aztec-packages/issues/9091))\r\n([ba63b43](https://github.com/AztecProtocol/aztec-packages/commit/ba63b43c6e5c09ecda0ed94bdd3b875546400d27))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Added healthcheck and startup check\r\n([#9112](https://github.com/AztecProtocol/aztec-packages/issues/9112))\r\n([ffa012f](https://github.com/AztecProtocol/aztec-packages/commit/ffa012ffb1d0e72ddab68c066ca9e923bd1c0c2b))\r\n* Default logging level to debug if debug set\r\n([#9173](https://github.com/AztecProtocol/aztec-packages/issues/9173))\r\n([febf744](https://github.com/AztecProtocol/aztec-packages/commit/febf7449c80ffe44eaadb88c088e35fa419ed443))\r\n* Rename some prover env vars\r\n([#9032](https://github.com/AztecProtocol/aztec-packages/issues/9032))\r\n([e27ead8](https://github.com/AztecProtocol/aztec-packages/commit/e27ead85403d3f21ebc406e7d1a7e18190085603))\r\n</details>\r\n\r\n<details><summary>barretenberg.js: 0.58.0</summary>\r\n\r\n##\r\n[0.58.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.57.0...barretenberg.js-v0.58.0)\r\n(2024-10-18)\r\n\r\n\r\n### Features\r\n\r\n* Browser tests for UltraHonk\r\n([#9047](https://github.com/AztecProtocol/aztec-packages/issues/9047))\r\n([f0d45dd](https://github.com/AztecProtocol/aztec-packages/commit/f0d45dd8d0c00707cd18989c3a45ff0c3cbc92a6))\r\n* Docker_fast.sh\r\n([#9273](https://github.com/AztecProtocol/aztec-packages/issues/9273))\r\n([57e792e](https://github.com/AztecProtocol/aztec-packages/commit/57e792e6baaa2dfaef7af4c84d4ab75804c9d3de))\r\n* Use s3 cache in bootstrap fast\r\n([#9111](https://github.com/AztecProtocol/aztec-packages/issues/9111))\r\n([349f938](https://github.com/AztecProtocol/aztec-packages/commit/349f938601f7a4fdbdf83aea62c7b8c244bbe434))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Limit number of bb.js threads to 32\r\n([#9070](https://github.com/AztecProtocol/aztec-packages/issues/9070))\r\n([97e4b9b](https://github.com/AztecProtocol/aztec-packages/commit/97e4b9b2e0d37575b6b5e4c7a22f85b60d1f418b))\r\n* Make gate counting functions less confusing and avoid estimations\r\n([#9046](https://github.com/AztecProtocol/aztec-packages/issues/9046))\r\n([0bda0a4](https://github.com/AztecProtocol/aztec-packages/commit/0bda0a4d71ae0fb4352de0746f7d96b63b787888))\r\n* Reduce SRS size back to normal\r\n([#9098](https://github.com/AztecProtocol/aztec-packages/issues/9098))\r\n([a306ea5](https://github.com/AztecProtocol/aztec-packages/commit/a306ea5ffeb13019427a96d8152e5642b717c5f6))\r\n* Revert \"feat: use s3 cache in bootstrap fast\"\r\n([#9181](https://github.com/AztecProtocol/aztec-packages/issues/9181))\r\n([7872d09](https://github.com/AztecProtocol/aztec-packages/commit/7872d092c359298273d7ab1fc23fa61ae1973f8b))\r\n* Revert \"fix: Revert \"feat: use s3 cache in bootstrap fast\"\"\r\n([#9182](https://github.com/AztecProtocol/aztec-packages/issues/9182))\r\n([ce3d08a](https://github.com/AztecProtocol/aztec-packages/commit/ce3d08a18684da9f5b1289a2b9bdf60a66342590))\r\n</details>\r\n\r\n<details><summary>aztec-packages: 0.58.0</summary>\r\n\r\n##\r\n[0.58.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.57.0...aztec-packages-v0.58.0)\r\n(2024-10-18)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* remove pedersen commitment\r\n([#9107](https://github.com/AztecProtocol/aztec-packages/issues/9107))\r\n* remove pedersen hash opcode\r\n([#9245](https://github.com/AztecProtocol/aztec-packages/issues/9245))\r\n* Brillig and AVM default all uninitialized memory cells to Field 0\r\n([#9057](https://github.com/AztecProtocol/aztec-packages/issues/9057))\r\n* Integer division is not the inverse of integer multiplication\r\n(https://github.com/noir-lang/noir/pull/6243)\r\n* kind size checks (https://github.com/noir-lang/noir/pull/6137)\r\n* Change tag attributes to require a ' prefix\r\n(https://github.com/noir-lang/noir/pull/6235)\r\n* **avm:** remove tags from wire format\r\n([#9198](https://github.com/AztecProtocol/aztec-packages/issues/9198))\r\n* remove keccak256 opcode from ACIR/Brillig\r\n([#9104](https://github.com/AztecProtocol/aztec-packages/issues/9104))\r\n* **avm:** more instr wire format takes u16\r\n([#9174](https://github.com/AztecProtocol/aztec-packages/issues/9174))\r\n* Brillig with a stack and conditional inlining\r\n([#8989](https://github.com/AztecProtocol/aztec-packages/issues/8989))\r\n* unrevert \"feat: new per-enqueued-call gas limit\"\r\n([#9140](https://github.com/AztecProtocol/aztec-packages/issues/9140))\r\n* protocol contracts\r\n([#9025](https://github.com/AztecProtocol/aztec-packages/issues/9025))\r\n\r\n### Features\r\n\r\n* Add `checked_transmute` (https://github.com/noir-lang/noir/pull/6262)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Add insturmentation to attestation and epoch quote mem pools\r\n([#9055](https://github.com/AztecProtocol/aztec-packages/issues/9055))\r\n([7dfa295](https://github.com/AztecProtocol/aztec-packages/commit/7dfa2951d4116b104744704901d143b55dd275eb))\r\n* Add more `Type` and `UnresolvedType` methods\r\n(https://github.com/noir-lang/noir/pull/5994)\r\n([26185f0](https://github.com/AztecProtocol/aztec-packages/commit/26185f0e23d54e2f122ae07de573b77b2974e7c1))\r\n* Add sequencer address to metrics\r\n([#9145](https://github.com/AztecProtocol/aztec-packages/issues/9145))\r\n([c33d38b](https://github.com/AztecProtocol/aztec-packages/commit/c33d38b68a8c109e138a2809b530f7fdb1abb122))\r\n* Add validator address to logs\r\n([#9143](https://github.com/AztecProtocol/aztec-packages/issues/9143))\r\n([e245f83](https://github.com/AztecProtocol/aztec-packages/commit/e245f833e56b05cf11850cb8537d9dbba01de746))\r\n* Allow `unconstrained` after visibility\r\n(https://github.com/noir-lang/noir/pull/6246)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* **avm:** Codegen recursive_verifier.cpp\r\n([#9204](https://github.com/AztecProtocol/aztec-packages/issues/9204))\r\n([2592e50](https://github.com/AztecProtocol/aztec-packages/commit/2592e50b2bd9e76d35a3c9caac4d7042fe26b9b6)),\r\ncloses\r\n[#8849](https://github.com/AztecProtocol/aztec-packages/issues/8849)\r\n* **avm:** Constrain start and end l2/da gas\r\n([#9031](https://github.com/AztecProtocol/aztec-packages/issues/9031))\r\n([308c03b](https://github.com/AztecProtocol/aztec-packages/commit/308c03b9ad45001570e6232f88403de8cc7d3cfb)),\r\ncloses\r\n[#9001](https://github.com/AztecProtocol/aztec-packages/issues/9001)\r\n* **avm:** More instr wire format takes u16\r\n([#9174](https://github.com/AztecProtocol/aztec-packages/issues/9174))\r\n([3a01ad9](https://github.com/AztecProtocol/aztec-packages/commit/3a01ad93e21e9e6cd27b7a2a4c1e2c9f24d6363e))\r\n* **avm:** Remove tags from wire format\r\n([#9198](https://github.com/AztecProtocol/aztec-packages/issues/9198))\r\n([68a7326](https://github.com/AztecProtocol/aztec-packages/commit/68a7326d9f2d4bd891acac12950289d6e9fbe617))\r\n* Better tracing/metrics in validator and archiver\r\n([#9108](https://github.com/AztecProtocol/aztec-packages/issues/9108))\r\n([1801f5b](https://github.com/AztecProtocol/aztec-packages/commit/1801f5b49fb3b153817a1596c6fd568f1c762fe5))\r\n* Brillig and AVM default all uninitialized memory cells to Field 0\r\n([#9057](https://github.com/AztecProtocol/aztec-packages/issues/9057))\r\n([5861d4e](https://github.com/AztecProtocol/aztec-packages/commit/5861d4e5e8a72161dac910e0bc8e635e0d332793))\r\n* Brillig with a stack and conditional inlining\r\n([#8989](https://github.com/AztecProtocol/aztec-packages/issues/8989))\r\n([409b7b8](https://github.com/AztecProtocol/aztec-packages/commit/409b7b8c6b43a91fc1b5be48aee0174d56d914d9))\r\n* Browser tests for UltraHonk\r\n([#9047](https://github.com/AztecProtocol/aztec-packages/issues/9047))\r\n([f0d45dd](https://github.com/AztecProtocol/aztec-packages/commit/f0d45dd8d0c00707cd18989c3a45ff0c3cbc92a6))\r\n* Chaos mesh\r\n([#9196](https://github.com/AztecProtocol/aztec-packages/issues/9196))\r\n([134bef8](https://github.com/AztecProtocol/aztec-packages/commit/134bef8c3820fbf8ed08c7b44cbf5636d9342d99))\r\n* Docker_fast.sh\r\n([#9273](https://github.com/AztecProtocol/aztec-packages/issues/9273))\r\n([57e792e](https://github.com/AztecProtocol/aztec-packages/commit/57e792e6baaa2dfaef7af4c84d4ab75804c9d3de))\r\n* Don't crash LSP when there are errors resolving the workspace\r\n(https://github.com/noir-lang/noir/pull/6257)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Don't suggest private struct fields in LSP\r\n(https://github.com/noir-lang/noir/pull/6256)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Drop epoch duration / block times\r\n([#9149](https://github.com/AztecProtocol/aztec-packages/issues/9149))\r\n([c3e859b](https://github.com/AztecProtocol/aztec-packages/commit/c3e859b86ce66d42ed04dfd1b3d82995490f74ae))\r\n* Externally accessible spartan deployment\r\n([#9171](https://github.com/AztecProtocol/aztec-packages/issues/9171))\r\n([26edb4d](https://github.com/AztecProtocol/aztec-packages/commit/26edb4dd0b47df5d079fa8af7d20adef26da8ad7))\r\n* Fix encoding of public keys\r\n([#9158](https://github.com/AztecProtocol/aztec-packages/issues/9158))\r\n([35c66c9](https://github.com/AztecProtocol/aztec-packages/commit/35c66c9875c6515d719ff4633236e4e11d1b54a1))\r\n* Handwritten parser (https://github.com/noir-lang/noir/pull/6180)\r\n([26185f0](https://github.com/AztecProtocol/aztec-packages/commit/26185f0e23d54e2f122ae07de573b77b2974e7c1))\r\n* **improve:** Remove scan through globals\r\n(https://github.com/noir-lang/noir/pull/6282)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Integrate databus in the private kernels\r\n([#9028](https://github.com/AztecProtocol/aztec-packages/issues/9028))\r\n([1798b1c](https://github.com/AztecProtocol/aztec-packages/commit/1798b1cc701824dd268ed0e49e592febf01a1687))\r\n* Kind size checks (https://github.com/noir-lang/noir/pull/6137)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Make index in inbox global\r\n([#9110](https://github.com/AztecProtocol/aztec-packages/issues/9110))\r\n([375c017](https://github.com/AztecProtocol/aztec-packages/commit/375c017ac130a20f9cc20be11e5199327641013e)),\r\ncloses\r\n[#9085](https://github.com/AztecProtocol/aztec-packages/issues/9085)\r\n* Modify contract instance to include public keys\r\n([#9153](https://github.com/AztecProtocol/aztec-packages/issues/9153))\r\n([17c6127](https://github.com/AztecProtocol/aztec-packages/commit/17c612740dc3563321bf69c1760de1ef88b22124))\r\n* Native testnet helper script\r\n([#9260](https://github.com/AztecProtocol/aztec-packages/issues/9260))\r\n([1613c0f](https://github.com/AztecProtocol/aztec-packages/commit/1613c0f0e13101bfa152a6a6fac3a07cf7604ef0))\r\n* Native tmux-based network e2e\r\n([#9036](https://github.com/AztecProtocol/aztec-packages/issues/9036))\r\n([f9fc73a](https://github.com/AztecProtocol/aztec-packages/commit/f9fc73a40f5b9d11ad92a6cee3e29d3fcc80425e))\r\n* New per-enqueued-call gas limit\r\n([#9033](https://github.com/AztecProtocol/aztec-packages/issues/9033))\r\n([6ef0895](https://github.com/AztecProtocol/aztec-packages/commit/6ef0895ed9788c533b0caf2d2c30839552dabbcc))\r\n* New world state\r\n([#8776](https://github.com/AztecProtocol/aztec-packages/issues/8776))\r\n([41f3934](https://github.com/AztecProtocol/aztec-packages/commit/41f393443396cae77e09a09df07d42e6d5ff5618))\r\n* Nomismatokopio\r\n([#8940](https://github.com/AztecProtocol/aztec-packages/issues/8940))\r\n([1f53957](https://github.com/AztecProtocol/aztec-packages/commit/1f53957ffea720fc008a80623d0fb1da8a3cb302))\r\n* Optimize `Quoted::as_expr` by parsing just once\r\n(https://github.com/noir-lang/noir/pull/6237)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Optimize reading a workspace's files\r\n(https://github.com/noir-lang/noir/pull/6281)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Parameterize circuit epoch duration\r\n([#9050](https://github.com/AztecProtocol/aztec-packages/issues/9050))\r\n([1b902f6](https://github.com/AztecProtocol/aztec-packages/commit/1b902f663349198aa8f9b3a22663b5c8adc0d442))\r\n* **perf:** Flamegraphs for test program execution benchmarks\r\n(https://github.com/noir-lang/noir/pull/6253)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* **perf:** Follow array sets backwards in array set from get\r\noptimization (https://github.com/noir-lang/noir/pull/6208)\r\n([26185f0](https://github.com/AztecProtocol/aztec-packages/commit/26185f0e23d54e2f122ae07de573b77b2974e7c1))\r\n* Persistent storage edit for anvil node\r\n([#9089](https://github.com/AztecProtocol/aztec-packages/issues/9089))\r\n([9b72a69](https://github.com/AztecProtocol/aztec-packages/commit/9b72a69940d2d601256dbb88f59c39af2af0f182))\r\n* Protocol contracts\r\n([#9025](https://github.com/AztecProtocol/aztec-packages/issues/9025))\r\n([f3bcff0](https://github.com/AztecProtocol/aztec-packages/commit/f3bcff0c0943d190261de366301ed8f9267543f3))\r\n* Recover from '=' instead of ':' in struct constructor/pattern\r\n(https://github.com/noir-lang/noir/pull/6236)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Remove byte decomposition in `compute_decomposition`\r\n(https://github.com/noir-lang/noir/pull/6159)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Replace Zeromorph with Shplemini in ECCVM\r\n([#9102](https://github.com/AztecProtocol/aztec-packages/issues/9102))\r\n([c857cd9](https://github.com/AztecProtocol/aztec-packages/commit/c857cd9167f696fc237b64ff579952001eba7d40))\r\n* Restore VK tree\r\n([#9156](https://github.com/AztecProtocol/aztec-packages/issues/9156))\r\n([440e729](https://github.com/AztecProtocol/aztec-packages/commit/440e729758c3be99558cd36d4af3f10c324debb7))\r\n* Show LSP diagnostic related information\r\n(https://github.com/noir-lang/noir/pull/6277)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Slightly improve \"unexpected token\" error message\r\n(https://github.com/noir-lang/noir/pull/6279)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Stable deployments for spartan\r\n([#9147](https://github.com/AztecProtocol/aztec-packages/issues/9147))\r\n([3e1c02e](https://github.com/AztecProtocol/aztec-packages/commit/3e1c02efed2bc10b5f88f3017f9940eb68533510))\r\n* Structured commit\r\n([#9027](https://github.com/AztecProtocol/aztec-packages/issues/9027))\r\n([26f406b](https://github.com/AztecProtocol/aztec-packages/commit/26f406b0591b3f88cb37c5e8f7cb3cbfc625315e))\r\n* Sysstia\r\n([#8941](https://github.com/AztecProtocol/aztec-packages/issues/8941))\r\n([2da2fe2](https://github.com/AztecProtocol/aztec-packages/commit/2da2fe2655ad57ab2bc19d589768b2b84ee8e393))\r\n* **test:** Fuzz poseidon hases against an external library\r\n(https://github.com/noir-lang/noir/pull/6273)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* **test:** Fuzz test poseidon2 hash equivalence\r\n(https://github.com/noir-lang/noir/pull/6265)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* **test:** Fuzz test stdlib hash functions\r\n(https://github.com/noir-lang/noir/pull/6233)\r\n([26185f0](https://github.com/AztecProtocol/aztec-packages/commit/26185f0e23d54e2f122ae07de573b77b2974e7c1))\r\n* **test:** Include the PoseidonHasher in the fuzzing\r\n(https://github.com/noir-lang/noir/pull/6280)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Tracy time with instrumentation\r\n([#9170](https://github.com/AztecProtocol/aztec-packages/issues/9170))\r\n([1c008d9](https://github.com/AztecProtocol/aztec-packages/commit/1c008d9a2fad747142e8ca356d6c00cee1663f2c))\r\n* Trait inheritance (https://github.com/noir-lang/noir/pull/6252)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Unrevert \"feat: new per-enqueued-call gas limit\"\r\n([#9140](https://github.com/AztecProtocol/aztec-packages/issues/9140))\r\n([1323a34](https://github.com/AztecProtocol/aztec-packages/commit/1323a34c50e7727435129aa31a05ae7bdfb0ca09))\r\n* Use s3 cache in bootstrap fast\r\n([#9111](https://github.com/AztecProtocol/aztec-packages/issues/9111))\r\n([349f938](https://github.com/AztecProtocol/aztec-packages/commit/349f938601f7a4fdbdf83aea62c7b8c244bbe434))\r\n* Visibility for struct fields\r\n(https://github.com/noir-lang/noir/pull/6221)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* World State Re-orgs\r\n([#9035](https://github.com/AztecProtocol/aztec-packages/issues/9035))\r\n([04f4a7b](https://github.com/AztecProtocol/aztec-packages/commit/04f4a7b2ae141b7eee4464e8d2cc91460d0c650a))\r\n* World state synchronizer reorgs\r\n([#9091](https://github.com/AztecProtocol/aztec-packages/issues/9091))\r\n([ba63b43](https://github.com/AztecProtocol/aztec-packages/commit/ba63b43c6e5c09ecda0ed94bdd3b875546400d27))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Accidental e2e inclusion\r\n([6e651de](https://github.com/AztecProtocol/aztec-packages/commit/6e651de0d37b925900d2109a9c1b1f67f25005c1))\r\n* Address inactive public key check in `verify_signature_noir`\r\n(https://github.com/noir-lang/noir/pull/6270)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Allow passing rayon threads when building aztec images\r\n([#9096](https://github.com/AztecProtocol/aztec-packages/issues/9096))\r\n([05de539](https://github.com/AztecProtocol/aztec-packages/commit/05de539d3a1a9dbfb2885b5b0d6d06e6109bbc77))\r\n* Assert block header matches\r\n([#9172](https://github.com/AztecProtocol/aztec-packages/issues/9172))\r\n([3e0504d](https://github.com/AztecProtocol/aztec-packages/commit/3e0504dc781878578d0e97450593f4628b6a57b0))\r\n* Avoid huge compilation times in base rollup\r\n([#9113](https://github.com/AztecProtocol/aztec-packages/issues/9113))\r\n([6eb43b6](https://github.com/AztecProtocol/aztec-packages/commit/6eb43b64cb13d97ecf8f8025a6d7e622d81b5db6))\r\n* Bb bootstrap_cache.sh\r\n([#9254](https://github.com/AztecProtocol/aztec-packages/issues/9254))\r\n([df37104](https://github.com/AztecProtocol/aztec-packages/commit/df3710477fc7d2e7c44e62b116bea74d4e14f930))\r\n* Better handle async timings in test\r\n([#9178](https://github.com/AztecProtocol/aztec-packages/issues/9178))\r\n([fb35151](https://github.com/AztecProtocol/aztec-packages/commit/fb35151c0d5e08f56b263eb15e0ddfc1565d4b17))\r\n* Buffer instanceof usage\r\n([#9235](https://github.com/AztecProtocol/aztec-packages/issues/9235))\r\n([8e66ef9](https://github.com/AztecProtocol/aztec-packages/commit/8e66ef97b133b3d57d5b3742e0acf2b3792433f7))\r\n* Build error around bb config in cli cmd\r\n([#9134](https://github.com/AztecProtocol/aztec-packages/issues/9134))\r\n([a5b677c](https://github.com/AztecProtocol/aztec-packages/commit/a5b677ca4aec3ace39924869c9517a256749c588))\r\n* Call correct method on fee juice contract\r\n([#9137](https://github.com/AztecProtocol/aztec-packages/issues/9137))\r\n([2dff976](https://github.com/AztecProtocol/aztec-packages/commit/2dff976202022cc474fdcc67bdcd3bc72e61dc70))\r\n* Change tag attributes to require a ' prefix\r\n(https://github.com/noir-lang/noir/pull/6235)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Check for Schnorr null signature\r\n(https://github.com/noir-lang/noir/pull/6226)\r\n([26185f0](https://github.com/AztecProtocol/aztec-packages/commit/26185f0e23d54e2f122ae07de573b77b2974e7c1))\r\n* **ci:** Don't report for now on kind-network-test\r\n([#9163](https://github.com/AztecProtocol/aztec-packages/issues/9163))\r\n([c59d693](https://github.com/AztecProtocol/aztec-packages/commit/c59d6936ea46296359abbd3cbf0823d44e64da90))\r\n* Dockerized vk build\r\n([#9078](https://github.com/AztecProtocol/aztec-packages/issues/9078))\r\n([2aac1fb](https://github.com/AztecProtocol/aztec-packages/commit/2aac1fb78790eb4472529146ab5ef562abe1d0fc))\r\n* Docs pdf generation\r\n([#9114](https://github.com/AztecProtocol/aztec-packages/issues/9114))\r\n([2f9c4e9](https://github.com/AztecProtocol/aztec-packages/commit/2f9c4e9883d3081fc9d6bf73bc2305ae197a61e8))\r\n* Don't warn on unuse global if it has an abi annotation\r\n(https://github.com/noir-lang/noir/pull/6258)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Don't warn on unused struct that has an abi annotation\r\n(https://github.com/noir-lang/noir/pull/6254)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* E2e bot follows pending chain\r\n([#9115](https://github.com/AztecProtocol/aztec-packages/issues/9115))\r\n([9afd190](https://github.com/AztecProtocol/aztec-packages/commit/9afd190fc234b1df64b53293434f1a1ab5e0dc94))\r\n* E2e-p2p attestation timeout\r\n([#9154](https://github.com/AztecProtocol/aztec-packages/issues/9154))\r\n([25bd47b](https://github.com/AztecProtocol/aztec-packages/commit/25bd47bb4faad24822d4671ee524fd6f1a50ff49))\r\n* **frontend:** Do not warn when a nested struct is provided as input to\r\nmain (https://github.com/noir-lang/noir/pull/6239)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Handle dfg databus in SSA normalization\r\n(https://github.com/noir-lang/noir/pull/6249)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Handle nested arrays in calldata\r\n(https://github.com/noir-lang/noir/pull/6232)\r\n([26185f0](https://github.com/AztecProtocol/aztec-packages/commit/26185f0e23d54e2f122ae07de573b77b2974e7c1))\r\n* Homogeneous input points for EC ADD\r\n(https://github.com/noir-lang/noir/pull/6241)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Increase l1 propose gas estimate\r\n([#9071](https://github.com/AztecProtocol/aztec-packages/issues/9071))\r\n([9d28414](https://github.com/AztecProtocol/aztec-packages/commit/9d284140bd58a9485fdbc3db52c08496adf1f7d1))\r\n* Integer division is not the inverse of integer multiplication\r\n(https://github.com/noir-lang/noir/pull/6243)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* K8s peer discovery\r\n([#9274](https://github.com/AztecProtocol/aztec-packages/issues/9274))\r\n([61e4d12](https://github.com/AztecProtocol/aztec-packages/commit/61e4d1290a9d019f3a2c54d504d9560fead4c6fa))\r\n* Limit number of bb.js threads to 32\r\n([#9070](https://github.com/AztecProtocol/aztec-packages/issues/9070))\r\n([97e4b9b](https://github.com/AztecProtocol/aztec-packages/commit/97e4b9b2e0d37575b6b5e4c7a22f85b60d1f418b))\r\n* Limit number of threads\r\n([#9135](https://github.com/AztecProtocol/aztec-packages/issues/9135))\r\n([19d2620](https://github.com/AztecProtocol/aztec-packages/commit/19d2620e7536dfe99eaea901da647aaf78478f2e))\r\n* Mac-build\r\n([#9216](https://github.com/AztecProtocol/aztec-packages/issues/9216))\r\n([80ea32c](https://github.com/AztecProtocol/aztec-packages/commit/80ea32cfda8c149980938382518c47a6da123e72))\r\n* Make gate counting functions less confusing and avoid estimations\r\n([#9046](https://github.com/AztecProtocol/aztec-packages/issues/9046))\r\n([0bda0a4](https://github.com/AztecProtocol/aztec-packages/commit/0bda0a4d71ae0fb4352de0746f7d96b63b787888))\r\n* Native_world_state_instance.ts\r\n([#9136](https://github.com/AztecProtocol/aztec-packages/issues/9136))\r\n([4a204c1](https://github.com/AztecProtocol/aztec-packages/commit/4a204c12c8dab688848a1aa2d65fcde7d3ee4982))\r\n* Panic on composite types within databus\r\n(https://github.com/noir-lang/noir/pull/6225)\r\n([26185f0](https://github.com/AztecProtocol/aztec-packages/commit/26185f0e23d54e2f122ae07de573b77b2974e7c1))\r\n* Prevent compiler panic when popping from empty slices\r\n(https://github.com/noir-lang/noir/pull/6274)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Prometheus metrics\r\n([#9226](https://github.com/AztecProtocol/aztec-packages/issues/9226))\r\n([9445a4f](https://github.com/AztecProtocol/aztec-packages/commit/9445a4fba8e3092c3948ffe9d5eaf5f679fce89c))\r\n* Publish-aztec-packages.yml\r\n([#9229](https://github.com/AztecProtocol/aztec-packages/issues/9229))\r\n([4bfeb83](https://github.com/AztecProtocol/aztec-packages/commit/4bfeb830ffc421386f4f9f8b4a23e2bc7fbf832d)),\r\ncloses\r\n[#9220](https://github.com/AztecProtocol/aztec-packages/issues/9220)\r\n* Reduce SRS size back to normal\r\n([#9098](https://github.com/AztecProtocol/aztec-packages/issues/9098))\r\n([a306ea5](https://github.com/AztecProtocol/aztec-packages/commit/a306ea5ffeb13019427a96d8152e5642b717c5f6))\r\n* Reject invalid expression with in CLI parser\r\n(https://github.com/noir-lang/noir/pull/6287)\r\n([70fb8fa](https://github.com/AztecProtocol/aztec-packages/commit/70fb8fa97ab0d2484cb49126271df7aa18432f3e))\r\n* Release `master` dockerhub images\r\n([#9117](https://github.com/AztecProtocol/aztec-packages/issues/9117))\r\n([6662fba](https://github.com/AztecProtocol/aztec-packages/commit/6662fbae99808d6d4de9f39db6ef587bb455156c))\r\n* Remove need for duplicate attributes on each function\r\n([#9244](https://github.com/AztecProtocol/aztec-packages/issues/9244))\r\n([ed933ee](https://github.com/AztecProtocol/aztec-packages/commit/ed933eefc2aab4b616dca94fee9a02837aec7fb9)),\r\ncloses\r\n[#9243](https://github.com/AztecProtocol/aztec-packages/issues/9243)\r\n* Revert \"feat: new per-enqueued-call gas limit\"\r\n([#9139](https://github.com/AztecProtocol/aztec-packages/issues/9139))\r\n([7677ca5](https://github.com/AztecProtocol/aztec-packages/commit/7677ca5d9280ac9615a92be36d1958960dbd7353))\r\n* Revert \"feat: use s3 cache in bootstrap fast\"\r\n([#9181](https://github.com/AztecProtocol/aztec-packages/issues/9181))\r\n([7872d09](https://github.com/AztecProtocol/aztec-packages/commit/7872d092c359298273d7ab1fc23fa61ae1973f8b))\r\n* Revert \"fix: Revert \"feat: use s3 cache in bootstrap fast\"\"\r\n([#9182](https://github.com/AztecProtocol/aztec-packages/issues/9182))\r\n([ce3d08a](https://github.com/AztecProtocol/aztec-packages/commit/ce3d08a18684da9f5b1289a2b9bdf60a66342590))\r\n* **s3-cache:** Link extracted preset-release-world-state\r\n([#9252](https://github.com/AztecProtocol/aztec-packages/issues/9252))\r\n([8b2d7d9](https://github.com/AztecProtocol/aztec-packages/commit/8b2d7d9c962c975592e17424f4d0b70f9ca7acd4))\r\n* Setup fee juice for e2e tests\r\n([#9094](https://github.com/AztecProtocol/aztec-packages/issues/9094))\r\n([a8ec91a](https://github.com/AztecProtocol/aztec-packages/commit/a8ec91a32d8fee3d309c855ed9d43a6c025c487b))\r\n* Spartan account pre-funding\r\n([#9161](https://github.com/AztecProtocol/aztec-packages/issues/9161))\r\n([f4754f7](https://github.com/AztecProtocol/aztec-packages/commit/f4754f7ea9587edbe8367c49539f65d25e251e23))\r\n* Transaction bot proper configuration\r\n([#9106](https://github.com/AztecProtocol/aztec-packages/issues/9106))\r\n([666fc38](https://github.com/AztecProtocol/aztec-packages/commit/666fc382fba1235ec0bca9a6cd027734e49eb182))\r\n* Unrevert \"feat: trace AVM side effects per enqueued call\"\"\r\n([#9095](https://github.com/AztecProtocol/aztec-packages/issues/9095))\r\n([72e4867](https://github.com/AztecProtocol/aztec-packages/commit/72e4867fc0c429563f7c54092470010d1e6553a9))\r\n* Visibility for impl methods\r\n(https://github.com/noir-lang/noir/pull/6261)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Activate peer scoring for other p2p topics\r\n([#9097](https://github.com/AztecProtocol/aztec-packages/issues/9097))\r\n([18d24fb](https://github.com/AztecProtocol/aztec-packages/commit/18d24fbd1083c22507cd7b421976c7c63f11d140))\r\n* Add regression test for\r\n[#5756](https://github.com/AztecProtocol/aztec-packages/issues/5756)\r\n(https://github.com/noir-lang/noir/pull/5770)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Add world_state_napi to bootstrap fast\r\n([#9079](https://github.com/AztecProtocol/aztec-packages/issues/9079))\r\n([e827056](https://github.com/AztecProtocol/aztec-packages/commit/e827056e652a4789c91a617587945d57163fa7ff))\r\n* Added healthcheck and startup check\r\n([#9112](https://github.com/AztecProtocol/aztec-packages/issues/9112))\r\n([ffa012f](https://github.com/AztecProtocol/aztec-packages/commit/ffa012ffb1d0e72ddab68c066ca9e923bd1c0c2b))\r\n* Adjust debug level of received attestations\r\n([#9087](https://github.com/AztecProtocol/aztec-packages/issues/9087))\r\n([eb67dd4](https://github.com/AztecProtocol/aztec-packages/commit/eb67dd4ab47755cd8e1445be3fb1b75a4d6c3f21))\r\n* **avm:** Revert 9080 - re-introducing start/end gas constraining\r\n([#9109](https://github.com/AztecProtocol/aztec-packages/issues/9109))\r\n([763e9b8](https://github.com/AztecProtocol/aztec-packages/commit/763e9b8a98981545b68f96e5b49a0726fc3c80b3))\r\n* **avm:** Type aliasing for VmPublicInputs\r\n([#8884](https://github.com/AztecProtocol/aztec-packages/issues/8884))\r\n([f3ed39b](https://github.com/AztecProtocol/aztec-packages/commit/f3ed39bf7be6f08bcfcabf6c04eb570f4d06ed27))\r\n* **ci:** Disable gossip_network.test.ts\r\n([#9165](https://github.com/AztecProtocol/aztec-packages/issues/9165))\r\n([5e7ab1d](https://github.com/AztecProtocol/aztec-packages/commit/5e7ab1de0a9b4da56ff84381cf3dea44837bd79d))\r\n* **ci:** Parallelise CI for acir-test flows\r\n([#9238](https://github.com/AztecProtocol/aztec-packages/issues/9238))\r\n([73a7c23](https://github.com/AztecProtocol/aztec-packages/commit/73a7c231193d56fdbf2e1160be5ea8d58f5596bb))\r\n* **ci:** Parallelise noir-projects CI\r\n([#9270](https://github.com/AztecProtocol/aztec-packages/issues/9270))\r\n([44ad5e5](https://github.com/AztecProtocol/aztec-packages/commit/44ad5e595c09639eac0913be3b653d32eb4accac))\r\n* **ci:** Try to offload compute burden when merging\r\n([#9213](https://github.com/AztecProtocol/aztec-packages/issues/9213))\r\n([c8dc016](https://github.com/AztecProtocol/aztec-packages/commit/c8dc016a2bfc5b41899c32e3bf2b2d3ffb855140))\r\n* Configure trees instead of duplicating constants\r\n([#9088](https://github.com/AztecProtocol/aztec-packages/issues/9088))\r\n([c1150c9](https://github.com/AztecProtocol/aztec-packages/commit/c1150c9b28581985686b13ba97eb7f0066736652))\r\n* Default logging level to debug if debug set\r\n([#9173](https://github.com/AztecProtocol/aztec-packages/issues/9173))\r\n([febf744](https://github.com/AztecProtocol/aztec-packages/commit/febf7449c80ffe44eaadb88c088e35fa419ed443))\r\n* **deployments:** Native network test\r\n([#9138](https://github.com/AztecProtocol/aztec-packages/issues/9138))\r\n([975ea36](https://github.com/AztecProtocol/aztec-packages/commit/975ea3617d9cddc2d2c35aa56c8e7b1f5d5069ab))\r\n* Different metrics values for production and local\r\n([#9124](https://github.com/AztecProtocol/aztec-packages/issues/9124))\r\n([6888d70](https://github.com/AztecProtocol/aztec-packages/commit/6888d70be014b4d541c1e584248ae6eca8562a04))\r\n* Disable e2e-p2p completely\r\n([#9219](https://github.com/AztecProtocol/aztec-packages/issues/9219))\r\n([286d617](https://github.com/AztecProtocol/aztec-packages/commit/286d617e3f06395ee5c88339b8d57170aad00213))\r\n* Disable flakey rediscovery.test.ts\r\n([#9217](https://github.com/AztecProtocol/aztec-packages/issues/9217))\r\n([14e73e2](https://github.com/AztecProtocol/aztec-packages/commit/14e73e29a784a3b6131b464b40058dcf8bb53a86))\r\n* **docs:** Rewriting bbup script, refactoring bb readme for clarity\r\n([#9073](https://github.com/AztecProtocol/aztec-packages/issues/9073))\r\n([662b61e](https://github.com/AztecProtocol/aztec-packages/commit/662b61e4c20a2d4217980922d4578f4dfeacae6b))\r\n* Eccvm transcript builder\r\n([#9026](https://github.com/AztecProtocol/aztec-packages/issues/9026))\r\n([d2c9ae2](https://github.com/AztecProtocol/aztec-packages/commit/d2c9ae2853bb75cd736583406a57e96645bd2e88))\r\n* Expose util func to convert field compressed string back to string in\r\naztec js\r\n([#9239](https://github.com/AztecProtocol/aztec-packages/issues/9239))\r\n([ce7e687](https://github.com/AztecProtocol/aztec-packages/commit/ce7e687506104828ddc96f66fd30845bda6494fc)),\r\ncloses\r\n[#9233](https://github.com/AztecProtocol/aztec-packages/issues/9233)\r\n* Fix missing migrations to immutable contract fn interaction\r\n([#9053](https://github.com/AztecProtocol/aztec-packages/issues/9053))\r\n([41c496f](https://github.com/AztecProtocol/aztec-packages/commit/41c496f9271ebe3d53fbb6d988a7306617ee7e38))\r\n* Format noir stuff\r\n([#9202](https://github.com/AztecProtocol/aztec-packages/issues/9202))\r\n([2b09709](https://github.com/AztecProtocol/aztec-packages/commit/2b09709932885b8a0de4bf2b91fb381d39baf6b2))\r\n* Goodbye circleci\r\n([#9259](https://github.com/AztecProtocol/aztec-packages/issues/9259))\r\n([dab2a93](https://github.com/AztecProtocol/aztec-packages/commit/dab2a933128a3b42c6a62152a51a46c5e7a3d09d))\r\n* Improve setup_local_k8s.sh to focus kind\r\n([#9228](https://github.com/AztecProtocol/aztec-packages/issues/9228))\r\n([8efdb47](https://github.com/AztecProtocol/aztec-packages/commit/8efdb474611730320ca2aadd87ff6238d464c2c9))\r\n* Increase tx bot delay\r\n([9e0ab97](https://github.com/AztecProtocol/aztec-packages/commit/9e0ab97194b8338e4b4292229c9bf911c7446dcc))\r\n* Log revert reason on publish to L1\r\n([#9067](https://github.com/AztecProtocol/aztec-packages/issues/9067))\r\n([814b6d0](https://github.com/AztecProtocol/aztec-packages/commit/814b6d09d1e4750c5b3277cebde523f17af5f85e))\r\n* Modify note processors and synchronizers to use complete address\r\n([#9152](https://github.com/AztecProtocol/aztec-packages/issues/9152))\r\n([730d90f](https://github.com/AztecProtocol/aztec-packages/commit/730d90fcfdc65c00a1867420fdc8211a72293cd9))\r\n* Move contract stuff from types into circuits.js\r\n([#9151](https://github.com/AztecProtocol/aztec-packages/issues/9151))\r\n([d8131bc](https://github.com/AztecProtocol/aztec-packages/commit/d8131bc5c1b4d47d20c3312598296bfb89cecf11))\r\n* Move public keys to protocol circuits\r\n([#9074](https://github.com/AztecProtocol/aztec-packages/issues/9074))\r\n([8adbdd5](https://github.com/AztecProtocol/aztec-packages/commit/8adbdd5827a81cf7b34bc06883367d0dc47a47a2))\r\n* Offsite network stuff\r\n([#9231](https://github.com/AztecProtocol/aztec-packages/issues/9231))\r\n([155b40b](https://github.com/AztecProtocol/aztec-packages/commit/155b40b67616387f183dcb05d6ab08e9e4c3ab72))\r\n* **p2p:** Refactor pools\r\n([#9065](https://github.com/AztecProtocol/aztec-packages/issues/9065))\r\n([b62235e](https://github.com/AztecProtocol/aztec-packages/commit/b62235ed75b55f79fd84a5ebf1a1f5af28fa289a))\r\n* **p2p:** Store received epoch quotes\r\n([#9064](https://github.com/AztecProtocol/aztec-packages/issues/9064))\r\n([e3b467f](https://github.com/AztecProtocol/aztec-packages/commit/e3b467f70ca1d41bd27ac7231e257f1329ed0896))\r\n* Pass by const reference\r\n([#9083](https://github.com/AztecProtocol/aztec-packages/issues/9083))\r\n([764bba4](https://github.com/AztecProtocol/aztec-packages/commit/764bba4dd8a016d45b201562ec82f9a12de65c2d))\r\n* Pre-initialise validators in cluster\r\n([#9048](https://github.com/AztecProtocol/aztec-packages/issues/9048))\r\n([e2d32a1](https://github.com/AztecProtocol/aztec-packages/commit/e2d32a113ca279ee205a666c24061199e34e1e7b))\r\n* Quieter cache-download.sh\r\n([#9176](https://github.com/AztecProtocol/aztec-packages/issues/9176))\r\n([b75d4c8](https://github.com/AztecProtocol/aztec-packages/commit/b75d4c85531ab149e142b79749eca9320baacf1a))\r\n* Reenable sync test\r\n([#9160](https://github.com/AztecProtocol/aztec-packages/issues/9160))\r\n([a71642f](https://github.com/AztecProtocol/aztec-packages/commit/a71642f052e89f601c30f082b83c372d6e68f9ee))\r\n* Regression test for\r\n[#5462](https://github.com/AztecProtocol/aztec-packages/issues/5462)\r\n(https://github.com/noir-lang/noir/pull/6286)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Remove AvmVerificationKeyData and tube specific types\r\n([#8569](https://github.com/AztecProtocol/aztec-packages/issues/8569))\r\n([da6c579](https://github.com/AztecProtocol/aztec-packages/commit/da6c579975112d8d629e64834465b6a52b04eb6a))\r\n* Remove end-to-end from circleci\r\n([#9116](https://github.com/AztecProtocol/aztec-packages/issues/9116))\r\n([4d1f7d8](https://github.com/AztecProtocol/aztec-packages/commit/4d1f7d83f9d14b1df70a26c99f696aebd0416ebd))\r\n* Remove keccak256 opcode from ACIR/Brillig\r\n([#9104](https://github.com/AztecProtocol/aztec-packages/issues/9104))\r\n([4c1163a](https://github.com/AztecProtocol/aztec-packages/commit/4c1163a9e9516d298e55421f1cf0ed81081151dd))\r\n* Remove pedersen commitment\r\n([#9107](https://github.com/AztecProtocol/aztec-packages/issues/9107))\r\n([1823bde](https://github.com/AztecProtocol/aztec-packages/commit/1823bde2b486827f33a87899074594f811cfbef4))\r\n* Remove pedersen hash opcode\r\n([#9245](https://github.com/AztecProtocol/aztec-packages/issues/9245))\r\n([1f0538f](https://github.com/AztecProtocol/aztec-packages/commit/1f0538f00cadcf4325d2aa17bdb098d11ca3840f))\r\n* Rename some prover env vars\r\n([#9032](https://github.com/AztecProtocol/aztec-packages/issues/9032))\r\n([e27ead8](https://github.com/AztecProtocol/aztec-packages/commit/e27ead85403d3f21ebc406e7d1a7e18190085603))\r\n* Replace relative paths to noir-protocol-circuits\r\n([424afba](https://github.com/AztecProtocol/aztec-packages/commit/424afbae1b1d4a9a8e01dfe4cca141407bf1bc44))\r\n* Replace relative paths to noir-protocol-circuits\r\n([bef3907](https://github.com/AztecProtocol/aztec-packages/commit/bef39073e2a380bf7ae815053dc6d5e4665aa13a))\r\n* Replace relative paths to noir-protocol-circuits\r\n([1b21a31](https://github.com/AztecProtocol/aztec-packages/commit/1b21a317209be12453d805e29a3112e47cfcf394))\r\n* Replace relative paths to noir-protocol-circuits\r\n([5285348](https://github.com/AztecProtocol/aztec-packages/commit/52853488488b68dde602f9facb5c5d42d5609c8c))\r\n* Replace relative paths to noir-protocol-circuits\r\n([7934d39](https://github.com/AztecProtocol/aztec-packages/commit/7934d3946c856ecbc194be0e59f7a4023fdf66e2))\r\n* Replace relative paths to noir-protocol-circuits\r\n([b787722](https://github.com/AztecProtocol/aztec-packages/commit/b787722d72068160ca57440807edc1939dbb1cfe))\r\n* Replace relative paths to noir-protocol-circuits\r\n([21cb2b1](https://github.com/AztecProtocol/aztec-packages/commit/21cb2b1e68befc5c0cbb051d4521ea39b10cfb48))\r\n* Replace relative paths to noir-protocol-circuits\r\n([facf462](https://github.com/AztecProtocol/aztec-packages/commit/facf4625e7bc4d5506464f4e1d331d1b6ad48bc8))\r\n* Replace relative paths to noir-protocol-circuits\r\n([45a72af](https://github.com/AztecProtocol/aztec-packages/commit/45a72afac98b3be090cf517aaa8948d72015462f))\r\n* Reproduce AVM ecadd bug\r\n([#9019](https://github.com/AztecProtocol/aztec-packages/issues/9019))\r\n([757ccef](https://github.com/AztecProtocol/aztec-packages/commit/757ccefd280a0798d1f6fc5cb62efafe86764bee))\r\n* Revert \"feat(avm): constrain start and end l2/da gas\r\n([#9031](https://github.com/AztecProtocol/aztec-packages/issues/9031))\"\r\n([#9080](https://github.com/AztecProtocol/aztec-packages/issues/9080))\r\n([07e4c95](https://github.com/AztecProtocol/aztec-packages/commit/07e4c956494154685970849bc4dda60c25af31bc))\r\n* Revert deletion of the old bbup\r\n([#9146](https://github.com/AztecProtocol/aztec-packages/issues/9146))\r\n([3138078](https://github.com/AztecProtocol/aztec-packages/commit/3138078f0062d8426b3c45ac47646169317ab795))\r\n* Script for deploying the spartan network\r\n([#9167](https://github.com/AztecProtocol/aztec-packages/issues/9167))\r\n([4660cec](https://github.com/AztecProtocol/aztec-packages/commit/4660cec92802d0e165a2a1ddff08c6756348b527))\r\n* Swap `pub` and `unconstrained` in function signatures\r\n([#9237](https://github.com/AztecProtocol/aztec-packages/issues/9237))\r\n([1c7e627](https://github.com/AztecProtocol/aztec-packages/commit/1c7e627e28eeabe0cbf9ccae45e107d66b0953b0))\r\n* Update palla/update-env-vars-prover to add new env var to spartan\r\n([#9069](https://github.com/AztecProtocol/aztec-packages/issues/9069))\r\n([077a01c](https://github.com/AztecProtocol/aztec-packages/commit/077a01c9a10d5a30c85e881d4a786eed7e25c492))\r\n* Update validator management policy to be parallel\r\n([#9086](https://github.com/AztecProtocol/aztec-packages/issues/9086))\r\n([f8267f2](https://github.com/AztecProtocol/aztec-packages/commit/f8267f292b9aabfa29e3e056cb42f56d5ad0f163))\r\n* Wire bb skip cleanup for bb prover\r\n([#9100](https://github.com/AztecProtocol/aztec-packages/issues/9100))\r\n([bba5674](https://github.com/AztecProtocol/aztec-packages/commit/bba56743ece19986f8259c4cf5bfdd7573207054))\r\n\r\n\r\n### Documentation\r\n\r\n* Initial pass on node guide\r\n([#9192](https://github.com/AztecProtocol/aztec-packages/issues/9192))\r\n([0fa1423](https://github.com/AztecProtocol/aztec-packages/commit/0fa14238fa83e8ad3939db8d4afd664e179fa887))\r\n</details>\r\n\r\n<details><summary>barretenberg: 0.58.0</summary>\r\n\r\n##\r\n[0.58.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.57.0...barretenberg-v0.58.0)\r\n(2024-10-18)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* remove pedersen commitment\r\n([#9107](https://github.com/AztecProtocol/aztec-packages/issues/9107))\r\n* remove pedersen hash opcode\r\n([#9245](https://github.com/AztecProtocol/aztec-packages/issues/9245))\r\n* Brillig and AVM default all uninitialized memory cells to Field 0\r\n([#9057](https://github.com/AztecProtocol/aztec-packages/issues/9057))\r\n* **avm:** remove tags from wire format\r\n([#9198](https://github.com/AztecProtocol/aztec-packages/issues/9198))\r\n* remove keccak256 opcode from ACIR/Brillig\r\n([#9104](https://github.com/AztecProtocol/aztec-packages/issues/9104))\r\n* **avm:** more instr wire format takes u16\r\n([#9174](https://github.com/AztecProtocol/aztec-packages/issues/9174))\r\n* Brillig with a stack and conditional inlining\r\n([#8989](https://github.com/AztecProtocol/aztec-packages/issues/8989))\r\n* unrevert \"feat: new per-enqueued-call gas limit\"\r\n([#9140](https://github.com/AztecProtocol/aztec-packages/issues/9140))\r\n\r\n### Features\r\n\r\n* **avm:** Codegen recursive_verifier.cpp\r\n([#9204](https://github.com/AztecProtocol/aztec-packages/issues/9204))\r\n([2592e50](https://github.com/AztecProtocol/aztec-packages/commit/2592e50b2bd9e76d35a3c9caac4d7042fe26b9b6)),\r\ncloses\r\n[#8849](https://github.com/AztecProtocol/aztec-packages/issues/8849)\r\n* **avm:** Constrain start and end l2/da gas\r\n([#9031](https://github.com/AztecProtocol/aztec-packages/issues/9031))\r\n([308c03b](https://github.com/AztecProtocol/aztec-packages/commit/308c03b9ad45001570e6232f88403de8cc7d3cfb)),\r\ncloses\r\n[#9001](https://github.com/AztecProtocol/aztec-packages/issues/9001)\r\n* **avm:** More instr wire format takes u16\r\n([#9174](https://github.com/AztecProtocol/aztec-packages/issues/9174))\r\n([3a01ad9](https://github.com/AztecProtocol/aztec-packages/commit/3a01ad93e21e9e6cd27b7a2a4c1e2c9f24d6363e))\r\n* **avm:** Remove tags from wire format\r\n([#9198](https://github.com/AztecProtocol/aztec-packages/issues/9198))\r\n([68a7326](https://github.com/AztecProtocol/aztec-packages/commit/68a7326d9f2d4bd891acac12950289d6e9fbe617))\r\n* Brillig and AVM default all uninitialized memory cells to Field 0\r\n([#9057](https://github.com/AztecProtocol/aztec-packages/issues/9057))\r\n([5861d4e](https://github.com/AztecProtocol/aztec-packages/commit/5861d4e5e8a72161dac910e0bc8e635e0d332793))\r\n* Brillig with a stack and conditional inlining\r\n([#8989](https://github.com/AztecProtocol/aztec-packages/issues/8989))\r\n([409b7b8](https://github.com/AztecProtocol/aztec-packages/commit/409b7b8c6b43a91fc1b5be48aee0174d56d914d9))\r\n* Browser tests for UltraHonk\r\n([#9047](https://github.com/AztecProtocol/aztec-packages/issues/9047))\r\n([f0d45dd](https://github.com/AztecProtocol/aztec-packages/commit/f0d45dd8d0c00707cd18989c3a45ff0c3cbc92a6))\r\n* Integrate databus in the private kernels\r\n([#9028](https://github.com/AztecProtocol/aztec-packages/issues/9028))\r\n([1798b1c](https://github.com/AztecProtocol/aztec-packages/commit/1798b1cc701824dd268ed0e49e592febf01a1687))\r\n* Modify contract instance to include public keys\r\n([#9153](https://github.com/AztecProtocol/aztec-packages/issues/9153))\r\n([17c6127](https://github.com/AztecProtocol/aztec-packages/commit/17c612740dc3563321bf69c1760de1ef88b22124))\r\n* New per-enqueued-call gas limit\r\n([#9033](https://github.com/AztecProtocol/aztec-packages/issues/9033))\r\n([6ef0895](https://github.com/AztecProtocol/aztec-packages/commit/6ef0895ed9788c533b0caf2d2c30839552dabbcc))\r\n* New world state\r\n([#8776](https://github.com/AztecProtocol/aztec-packages/issues/8776))\r\n([41f3934](https://github.com/AztecProtocol/aztec-packages/commit/41f393443396cae77e09a09df07d42e6d5ff5618))\r\n* Replace Zeromorph with Shplemini in ECCVM\r\n([#9102](https://github.com/AztecProtocol/aztec-packages/issues/9102))\r\n([c857cd9](https://github.com/AztecProtocol/aztec-packages/commit/c857cd9167f696fc237b64ff579952001eba7d40))\r\n* Structured commit\r\n([#9027](https://github.com/AztecProtocol/aztec-packages/issues/9027))\r\n([26f406b](https://github.com/AztecProtocol/aztec-packages/commit/26f406b0591b3f88cb37c5e8f7cb3cbfc625315e))\r\n* Tracy time with instrumentation\r\n([#9170](https://github.com/AztecProtocol/aztec-packages/issues/9170))\r\n([1c008d9](https://github.com/AztecProtocol/aztec-packages/commit/1c008d9a2fad747142e8ca356d6c00cee1663f2c))\r\n* Unrevert \"feat: new per-enqueued-call gas limit\"\r\n([#9140](https://github.com/AztecProtocol/aztec-packages/issues/9140))\r\n([1323a34](https://github.com/AztecProtocol/aztec-packages/commit/1323a34c50e7727435129aa31a05ae7bdfb0ca09))\r\n* Use s3 cache in bootstrap fast\r\n([#9111](https://github.com/AztecProtocol/aztec-packages/issues/9111))\r\n([349f938](https://github.com/AztecProtocol/aztec-packages/commit/349f938601f7a4fdbdf83aea62c7b8c244bbe434))\r\n* World State Re-orgs\r\n([#9035](https://github.com/AztecProtocol/aztec-packages/issues/9035))\r\n([04f4a7b](https://github.com/AztecProtocol/aztec-packages/commit/04f4a7b2ae141b7eee4464e8d2cc91460d0c650a))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Bb bootstrap_cache.sh\r\n([#9254](https://github.com/AztecProtocol/aztec-packages/issues/9254))\r\n([df37104](https://github.com/AztecProtocol/aztec-packages/commit/df3710477fc7d2e7c44e62b116bea74d4e14f930))\r\n* Limit number of bb.js threads to 32\r\n([#9070](https://github.com/AztecProtocol/aztec-packages/issues/9070))\r\n([97e4b9b](https://github.com/AztecProtocol/aztec-packages/commit/97e4b9b2e0d37575b6b5e4c7a22f85b60d1f418b))\r\n* Mac-build\r\n([#9216](https://github.com/AztecProtocol/aztec-packages/issues/9216))\r\n([80ea32c](https://github.com/AztecProtocol/aztec-packages/commit/80ea32cfda8c149980938382518c47a6da123e72))\r\n* Make gate counting functions less confusing and avoid estimations\r\n([#9046](https://github.com/AztecProtocol/aztec-packages/issues/9046))\r\n([0bda0a4](https://github.com/AztecProtocol/aztec-packages/commit/0bda0a4d71ae0fb4352de0746f7d96b63b787888))\r\n* Reduce SRS size back to normal\r\n([#9098](https://github.com/AztecProtocol/aztec-packages/issues/9098))\r\n([a306ea5](https://github.com/AztecProtocol/aztec-packages/commit/a306ea5ffeb13019427a96d8152e5642b717c5f6))\r\n* Revert \"feat: new per-enqueued-call gas limit\"\r\n([#9139](https://github.com/AztecProtocol/aztec-packages/issues/9139))\r\n([7677ca5](https://github.com/AztecProtocol/aztec-packages/commit/7677ca5d9280ac9615a92be36d1958960dbd7353))\r\n* Revert \"feat: use s3 cache in bootstrap fast\"\r\n([#9181](https://github.com/AztecProtocol/aztec-packages/issues/9181))\r\n([7872d09](https://github.com/AztecProtocol/aztec-packages/commit/7872d092c359298273d7ab1fc23fa61ae1973f8b))\r\n* Revert \"fix: Revert \"feat: use s3 cache in bootstrap fast\"\"\r\n([#9182](https://github.com/AztecProtocol/aztec-packages/issues/9182))\r\n([ce3d08a](https://github.com/AztecProtocol/aztec-packages/commit/ce3d08a18684da9f5b1289a2b9bdf60a66342590))\r\n* **s3-cache:** Link extracted preset-release-world-state\r\n([#9252](https://github.com/AztecProtocol/aztec-packages/issues/9252))\r\n([8b2d7d9](https://github.com/AztecProtocol/aztec-packages/commit/8b2d7d9c962c975592e17424f4d0b70f9ca7acd4))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Add world_state_napi to bootstrap fast\r\n([#9079](https://github.com/AztecProtocol/aztec-packages/issues/9079))\r\n([e827056](https://github.com/AztecProtocol/aztec-packages/commit/e827056e652a4789c91a617587945d57163fa7ff))\r\n* **avm:** Revert 9080 - re-introducing start/end gas constraining\r\n([#9109](https://github.com/AztecProtocol/aztec-packages/issues/9109))\r\n([763e9b8](https://github.com/AztecProtocol/aztec-packages/commit/763e9b8a98981545b68f96e5b49a0726fc3c80b3))\r\n* **avm:** Type aliasing for VmPublicInputs\r\n([#8884](https://github.com/AztecProtocol/aztec-packages/issues/8884))\r\n([f3ed39b](https://github.com/AztecProtocol/aztec-packages/commit/f3ed39bf7be6f08bcfcabf6c04eb570f4d06ed27))\r\n* **ci:** Parallelise CI for acir-test flows\r\n([#9238](https://github.com/AztecProtocol/aztec-packages/issues/9238))\r\n([73a7c23](https://github.com/AztecProtocol/aztec-packages/commit/73a7c231193d56fdbf2e1160be5ea8d58f5596bb))\r\n* Configure trees instead of duplicating constants\r\n([#9088](https://github.com/AztecProtocol/aztec-packages/issues/9088))\r\n([c1150c9](https://github.com/AztecProtocol/aztec-packages/commit/c1150c9b28581985686b13ba97eb7f0066736652))\r\n* **docs:** Rewriting bbup script, refactoring bb readme for clarity\r\n([#9073](https://github.com/AztecProtocol/aztec-packages/issues/9073))\r\n([662b61e](https://github.com/AztecProtocol/aztec-packages/commit/662b61e4c20a2d4217980922d4578f4dfeacae6b))\r\n* Eccvm transcript builder\r\n([#9026](https://github.com/AztecProtocol/aztec-packages/issues/9026))\r\n([d2c9ae2](https://github.com/AztecProtocol/aztec-packages/commit/d2c9ae2853bb75cd736583406a57e96645bd2e88))\r\n* Pass by const reference\r\n([#9083](https://github.com/AztecProtocol/aztec-packages/issues/9083))\r\n([764bba4](https://github.com/AztecProtocol/aztec-packages/commit/764bba4dd8a016d45b201562ec82f9a12de65c2d))\r\n* Remove keccak256 opcode from ACIR/Brillig\r\n([#9104](https://github.com/AztecProtocol/aztec-packages/issues/9104))\r\n([4c1163a](https://github.com/AztecProtocol/aztec-packages/commit/4c1163a9e9516d298e55421f1cf0ed81081151dd))\r\n* Remove pedersen commitment\r\n([#9107](https://github.com/AztecProtocol/aztec-packages/issues/9107))\r\n([1823bde](https://github.com/AztecProtocol/aztec-packages/commit/1823bde2b486827f33a87899074594f811cfbef4))\r\n* Remove pedersen hash opcode\r\n([#9245](https://github.com/AztecProtocol/aztec-packages/issues/9245))\r\n([1f0538f](https://github.com/AztecProtocol/aztec-packages/commit/1f0538f00cadcf4325d2aa17bdb098d11ca3840f))\r\n* Revert \"feat(avm): constrain start and end l2/da gas\r\n([#9031](https://github.com/AztecProtocol/aztec-packages/issues/9031))\"\r\n([#9080](https://github.com/AztecProtocol/aztec-packages/issues/9080))\r\n([07e4c95](https://github.com/AztecProtocol/aztec-packages/commit/07e4c956494154685970849bc4dda60c25af31bc))\r\n* Revert deletion of the old bbup\r\n([#9146](https://github.com/AztecProtocol/aztec-packages/issues/9146))\r\n([3138078](https://github.com/AztecProtocol/aztec-packages/commit/3138078f0062d8426b3c45ac47646169317ab795))\r\n</details>\r\n\r\n---\r\nThis PR was generated with [Release\r\nPlease](https://github.com/googleapis/release-please). See\r\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2024-10-18T14:33:50+01:00",
          "tree_id": "7d106bcfa54adb07689f24f01d28acfb256af236",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ab0c80d7493e6bdbc58dcd517b248de6ddd6fd67"
        },
        "date": 1729260875780,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29570.52335999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27792.735537 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5347.198416999987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5046.412398 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86872.24220400001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86872244000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15149.806839,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15149808000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2733243711,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2733243711 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126371290,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126371290 ns\nthreads: 1"
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
          "id": "6ce20e95c1cc24b6da37cd93f4417e473a3656e5",
          "message": "chore(master): Release 0.59.0 (#9281)\n\n:robot: I have created a release *beep* *boop*\r\n---\r\n\r\n\r\n<details><summary>aztec-package: 0.59.0</summary>\r\n\r\n##\r\n[0.59.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.58.0...aztec-package-v0.59.0)\r\n(2024-10-21)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* **seq:** disable sequencer and disable validator as one env var,\r\nupdate p2p listen port names\r\n([#9266](https://github.com/AztecProtocol/aztec-packages/issues/9266))\r\n\r\n### Miscellaneous\r\n\r\n* **seq:** Disable sequencer and disable validator as one env var,\r\nupdate p2p listen port names\r\n([#9266](https://github.com/AztecProtocol/aztec-packages/issues/9266))\r\n([367c38c](https://github.com/AztecProtocol/aztec-packages/commit/367c38c02b6cda494e9d3c64ea27a1cf3465f082))\r\n</details>\r\n\r\n<details><summary>barretenberg.js: 0.59.0</summary>\r\n\r\n##\r\n[0.59.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.58.0...barretenberg.js-v0.59.0)\r\n(2024-10-21)\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Publish readme on bb.js NPM package\r\n([#9303](https://github.com/AztecProtocol/aztec-packages/issues/9303))\r\n([1d860a8](https://github.com/AztecProtocol/aztec-packages/commit/1d860a82c290d820b0fcc55b61ef68f5501f7c1b))\r\n</details>\r\n\r\n<details><summary>aztec-packages: 0.59.0</summary>\r\n\r\n##\r\n[0.59.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.58.0...aztec-packages-v0.59.0)\r\n(2024-10-21)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* **seq:** disable sequencer and disable validator as one env var,\r\nupdate p2p listen port names\r\n([#9266](https://github.com/AztecProtocol/aztec-packages/issues/9266))\r\n\r\n### Bug Fixes\r\n\r\n* **docs:** Dapp tutorial edits\r\n([#8695](https://github.com/AztecProtocol/aztec-packages/issues/8695))\r\n([f95bcff](https://github.com/AztecProtocol/aztec-packages/commit/f95bcff9902b7e28bffcf96fbd7159b2da88e89c))\r\n* **docs:** Update debugging docs\r\n([#9200](https://github.com/AztecProtocol/aztec-packages/issues/9200))\r\n([2a4188c](https://github.com/AztecProtocol/aztec-packages/commit/2a4188ca91a1341a3dca1d052a842b730b50fd91))\r\n* Publish readme on bb.js NPM package\r\n([#9303](https://github.com/AztecProtocol/aztec-packages/issues/9303))\r\n([1d860a8](https://github.com/AztecProtocol/aztec-packages/commit/1d860a82c290d820b0fcc55b61ef68f5501f7c1b))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Re-enable test fixed by Native World State\r\n([#9289](https://github.com/AztecProtocol/aztec-packages/issues/9289))\r\n([3fd1802](https://github.com/AztecProtocol/aztec-packages/commit/3fd18028a84f1eae6e7e9d2858d5875a6e47595f)),\r\ncloses\r\n[#8306](https://github.com/AztecProtocol/aztec-packages/issues/8306)\r\n* Replace relative paths to noir-protocol-circuits\r\n([ceeab4e](https://github.com/AztecProtocol/aztec-packages/commit/ceeab4e08240884e84f08e94b32f5350c3def606))\r\n* **seq:** Disable sequencer and disable validator as one env var,\r\nupdate p2p listen port names\r\n([#9266](https://github.com/AztecProtocol/aztec-packages/issues/9266))\r\n([367c38c](https://github.com/AztecProtocol/aztec-packages/commit/367c38c02b6cda494e9d3c64ea27a1cf3465f082))\r\n</details>\r\n\r\n<details><summary>barretenberg: 0.59.0</summary>\r\n\r\n##\r\n[0.59.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.58.0...barretenberg-v0.59.0)\r\n(2024-10-21)\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **barretenberg:** Synchronize aztec-packages versions\r\n</details>\r\n\r\n---\r\nThis PR was generated with [Release\r\nPlease](https://github.com/googleapis/release-please). See\r\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2024-10-21T15:25:03Z",
          "tree_id": "4a76a126734ed0ebb0187002c959710545efe00f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6ce20e95c1cc24b6da37cd93f4417e473a3656e5"
        },
        "date": 1729526840684,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29716.861042999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27509.373063000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5347.117353999991,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5061.225337000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 87341.657137,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 87341658000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15151.157868000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15151157000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2696792989,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2696792989 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125200296,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125200296 ns\nthreads: 1"
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
          "id": "523aa231acd22228fa6414fc8241cebdfa21eafa",
          "message": "chore(avm): some cleaning in avm prover (#9311)\n\nThe AvmProver constructor body can be replaced by calling the\r\nconstructor for prover_polynomials.\r\nFurthermore, in execute_log_derivative_inverse_round() some temporary\r\nprover_polynomials are superfluous.",
          "timestamp": "2024-10-21T20:14:50+02:00",
          "tree_id": "559157c046becc07fed9ab368a0770a5f98e0e49",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/523aa231acd22228fa6414fc8241cebdfa21eafa"
        },
        "date": 1729535913375,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29460.341072999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27942.879940000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5324.454023000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5027.491238 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 87471.383593,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 87471385000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15299.117164,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15299117000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2709088876,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2709088876 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128532386,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128532386 ns\nthreads: 1"
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
          "id": "8d75dd4a6730c1af27b23bc786ed9db8eb199e6f",
          "message": "chore: Copying world state binary to yarn project is on generate (#9194)\n\nCopy native build artifacts in a separate \"generate\" step.\r\n\r\n---------\r\n\r\nCo-authored-by: Alex Gherghisan <alexghr@users.noreply.github.com>\r\nCo-authored-by: Alex Gherghisan <alexg@aztecprotocol.com>",
          "timestamp": "2024-10-22T07:49:26+01:00",
          "tree_id": "25941015c728282c475f49a7970ae30757d1e74b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8d75dd4a6730c1af27b23bc786ed9db8eb199e6f"
        },
        "date": 1729581245374,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29582.404536000013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27901.889957000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5454.81932300001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5112.049809 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 87331.435856,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 87331438000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15156.12526,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15156126000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2743106061,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2743106061 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 130181963,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 130181963 ns\nthreads: 1"
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
          "id": "42e5221dda3fc28dc7fcce3607af756132b4e314",
          "message": "fix(avm): public dispatch in proving tests (#9331)\n\nfixes a bug in the poseidon2_permutation, where we were using the space\r\nid from the main trace incorrectly. keccakF also missing an operand for\r\naddressing",
          "timestamp": "2024-10-22T16:26:33+01:00",
          "tree_id": "c92b9020a0c8d7d84def639ce170052d51f328fd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/42e5221dda3fc28dc7fcce3607af756132b4e314"
        },
        "date": 1729612324780,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29649.34950099999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28056.735666 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5406.272170000008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5082.340565 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 94252.168168,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 94252170000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15295.167253000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15295167000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2847390422,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2847390422 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133721808,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133721808 ns\nthreads: 1"
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
          "id": "465f88e9e89ac7af2ec8d4b061722dc3b776301e",
          "message": "chore!: remove delegate call and storage address (#9330)",
          "timestamp": "2024-10-22T17:15:13+01:00",
          "tree_id": "3a03ae9083ca7d9711721dd483f6b4c141030486",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/465f88e9e89ac7af2ec8d4b061722dc3b776301e"
        },
        "date": 1729616616621,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29670.64808500001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28299.233221 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5436.464221000008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5093.963801 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 88675.14667799999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 88675149000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15300.989161,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15300989000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2754464118,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2754464118 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 129922436,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 129922436 ns\nthreads: 1"
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
          "id": "e6db535b69e6769fa3f2c85a0685640c92ac147b",
          "message": "feat!: remove hash opcodes from AVM (#9209)\n\nResolves #9208",
          "timestamp": "2024-10-22T16:43:02Z",
          "tree_id": "46e09f3b8ff4df9ecb50bd78a98dc4bff4245ae0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e6db535b69e6769fa3f2c85a0685640c92ac147b"
        },
        "date": 1729618021699,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29478.750808,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27826.209185 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5341.426827000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4968.409257 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 87413.57943499999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 87413581000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15183.024077,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15183025000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2730711344,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2730711344 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126629136,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126629136 ns\nthreads: 1"
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
          "id": "d4dea162322eab233ed733aa318040e681cf5c70",
          "message": "feat: Handle reorgs on sequencer (#9201)\n\nTweaks the archiver so it can detect when a prune _will_ happen and can\r\nstart unwinding blocks then. This is then leveraged by the sequencer, so\r\nit builds the next block accounting for a reorg to happen. This also\r\nrequired tweaks on the L1 rollup contract so validations and checks\r\naccount for pruning.\r\n\r\n---------\r\n\r\nCo-authored-by: PhilWindle <philip.windle@gmail.com>",
          "timestamp": "2024-10-21T21:03:34+01:00",
          "tree_id": "af7f04d456631f296d89be53da8559fec4bb3cd3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d4dea162322eab233ed733aa318040e681cf5c70"
        },
        "date": 1729621665166,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29427.816224,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27878.38883 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5323.348326000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4986.687327000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 87900.35084099999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 87900353000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15168.970961,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15168971000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2714667506,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2714667506 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128287349,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128287349 ns\nthreads: 1"
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
          "id": "21fa3cf054cf1a3652c8a27ddf042c1c48b47039",
          "message": "feat: translator on Shplemini (#9329)\n\nIn this PR:\r\n* implement concatenation trick (to work for both Gemini and Shplemini),\r\ntry to document it and fix some other documentation in Shplemini\r\n* switch Translator to Shplemini\r\n\r\nThe Translator VM works on many many small polynomials (whose length is\r\ndetermined by a \"minicircuit size\"). To avoid the permutation relation\r\nhaving a very high degree, these small polynomials are split into\r\ngroups, and each group is concatenated into a single polynomial. We want\r\nthe prover to avoid having to commit to these extra concatenation\r\npolynomials (as they will likely not be sparse at all) but rather reuse\r\nthe commitments to the polynomials in its corresponding concatenation\r\ngroup, also showing they are correctly related in the opening protocol.\r\nBriefly, in Gemini, this is achieved by adding the contributibution to\r\nthe batched concatenated polynomials when computing the fold polynomials\r\n(A_0, A_1, ..., A_(logn -1)) but computing A_0- and A_0+ using the\r\npolyinomials in the batched concatenated groups. As the verifier only\r\nreceives commitments to A_1, .., A_(logn-1) and has to compute the\r\ncommitments to A_0- and A_0+ , it can then do this using the commitments\r\nof the polynomials in concatenation groups.",
          "timestamp": "2024-10-23T11:22:47Z",
          "tree_id": "4639acdc86297b1588f007e095b7030c66c14e85",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/21fa3cf054cf1a3652c8a27ddf042c1c48b47039"
        },
        "date": 1729683875837,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29591.349123000015,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27832.53973 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5362.287860999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5049.772502 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 87483.151404,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 87483154000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15087.907137000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15087907000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2717487451,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2717487451 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126614481,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126614481 ns\nthreads: 1"
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
          "id": "eae75872fdd813ed07f70c1e5d41c7b9f399ab72",
          "message": "feat(avm): full poseidon2 (#9141)\n\nPoseidon2 implementation for internal use by the avm in bytecode hashing\r\n/ address derivation etc",
          "timestamp": "2024-10-23T15:31:44+01:00",
          "tree_id": "46d9e08177347621b7945380bb4ae6e92095d765",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/eae75872fdd813ed07f70c1e5d41c7b9f399ab72"
        },
        "date": 1729695874735,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29660.227812000016,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28078.50849 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5373.452680999975,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4987.6560850000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 88532.326814,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 88532329000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15146.219340999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15146219000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2717120688,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2717120688 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126919086,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126919086 ns\nthreads: 1"
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
          "id": "cb58490eed9cc46a7b2039d93645a9456ee9c834",
          "message": "chore!: replace usage of vector in keccakf1600 input with array (#9350)\n\nWe're currently using a vector to represent the state array for\r\nkeccakf1600 opcodes in brillig. This is unnecessary as it's only defined\r\nfor inputs of size 25 so we should use an array.\r\n\r\n@dbanks12 This impacts AVM as you're also using a vector here. We should\r\nbe able to remove this extra operand from the AVM bytecode but I'm not\r\nsure how to propagate this through the rest of the AVM stack.\r\n\r\n---------\r\n\r\nCo-authored-by: dbanks12 <david@aztecprotocol.com>",
          "timestamp": "2024-10-23T19:39:12-04:00",
          "tree_id": "dc4514e5f732806049406587c599edea9c41689f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cb58490eed9cc46a7b2039d93645a9456ee9c834"
        },
        "date": 1729728391410,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29626.658018000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27963.268034999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5378.266448999966,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5056.678763999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 87461.171806,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 87461173000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15172.533287999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15172534000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2717145852,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2717145852 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126259638,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126259638 ns\nthreads: 1"
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
          "id": "c7d4572b49b33ee309f9238f3cec245878e6c295",
          "message": "feat: eccvm translator zk sumcheck (#9199)\n\nTurned on ZK Sumcheck in ECCVM and Translator Flavors.\r\n\r\nBenching `ClientIvc` with ZK sumcheck turned on in ECCVM and Translator:\r\n\r\n\r\n| Benchmark | without ZK | with ZK (best result) |with ZK | with ZK\r\n(worst result) | Overhead of Worst zk over non-ZK |\r\n\r\n|--------------------------|-------------|----------------|---------------|--------------|-----------------------------|\r\n| **ClientIVCBench/Full/2** | 12,039 ms | 12,512 ms | 12,658 ms | 12,778\r\nms | 6.14% |\r\n| **ClientIVCBench/Full/6** | 33,258 ms | 34,830 ms | 35,038 ms | 35,452\r\nms | 6.60% |\r\n\r\n\r\n**Using non-optimized ZK Sumcheck*",
          "timestamp": "2024-10-24T15:59:38+02:00",
          "tree_id": "5f72cbd64e9204880bf816fd6538cf289692a935",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c7d4572b49b33ee309f9238f3cec245878e6c295"
        },
        "date": 1729780781551,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30909.597624000013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29134.861133000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5355.720123000012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5051.7466190000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92142.76948700001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92142771000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15180.410025,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15180410000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2749052284,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2749052284 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126181819,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126181819 ns\nthreads: 1"
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
          "id": "09c9ad894ad64f44c25c191004273ae2828186d5",
          "message": "chore(master): Release 0.60.0 (#9310)\n\n:robot: I have created a release *beep* *boop*\r\n---\r\n\r\n\r\n<details><summary>aztec-package: 0.60.0</summary>\r\n\r\n##\r\n[0.60.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.59.0...aztec-package-v0.60.0)\r\n(2024-10-24)\r\n\r\n\r\n### Features\r\n\r\n* Introduce default public keys and replace empty public keys\r\n([#9277](https://github.com/AztecProtocol/aztec-packages/issues/9277))\r\n([47718ea](https://github.com/AztecProtocol/aztec-packages/commit/47718ea3a52468f5341a1203f70f48730faf9f7d))\r\n* Sequencer cast votes\r\n([#9247](https://github.com/AztecProtocol/aztec-packages/issues/9247))\r\n([bd05d87](https://github.com/AztecProtocol/aztec-packages/commit/bd05d87891b9df0d0d537c4c1efcdf7d128a6a6f))\r\n</details>\r\n\r\n<details><summary>barretenberg.js: 0.60.0</summary>\r\n\r\n##\r\n[0.60.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.59.0...barretenberg.js-v0.60.0)\r\n(2024-10-24)\r\n\r\n\r\n### Features\r\n\r\n* Eccvm translator zk sumcheck\r\n([#9199](https://github.com/AztecProtocol/aztec-packages/issues/9199))\r\n([c7d4572](https://github.com/AztecProtocol/aztec-packages/commit/c7d4572b49b33ee309f9238f3cec245878e6c295))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Remove noir_js_backend_barretenberg\r\n([#9338](https://github.com/AztecProtocol/aztec-packages/issues/9338))\r\n([cefe3d9](https://github.com/AztecProtocol/aztec-packages/commit/cefe3d901731d3b05de503ce93c97a3badf91363))\r\n</details>\r\n\r\n<details><summary>aztec-packages: 0.60.0</summary>\r\n\r\n##\r\n[0.60.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.59.0...aztec-packages-v0.60.0)\r\n(2024-10-24)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* replace usage of vector in keccakf1600 input with array\r\n([#9350](https://github.com/AztecProtocol/aztec-packages/issues/9350))\r\n* TXE single execution env\r\n([#9183](https://github.com/AztecProtocol/aztec-packages/issues/9183))\r\n* remove hash opcodes from AVM\r\n([#9209](https://github.com/AztecProtocol/aztec-packages/issues/9209))\r\n* remove delegate call and storage address\r\n([#9330](https://github.com/AztecProtocol/aztec-packages/issues/9330))\r\n\r\n### Features\r\n\r\n* Apella\r\n([#9084](https://github.com/AztecProtocol/aztec-packages/issues/9084))\r\n([205ce69](https://github.com/AztecProtocol/aztec-packages/commit/205ce69c0bd6a727d7472b5fec0e4fd5709e8ec1))\r\n* **avm:** Full poseidon2\r\n([#9141](https://github.com/AztecProtocol/aztec-packages/issues/9141))\r\n([eae7587](https://github.com/AztecProtocol/aztec-packages/commit/eae75872fdd813ed07f70c1e5d41c7b9f399ab72))\r\n* Bytes to fields and back\r\n([#8590](https://github.com/AztecProtocol/aztec-packages/issues/8590))\r\n([65b8493](https://github.com/AztecProtocol/aztec-packages/commit/65b849396173b8b1b0d0c66395352bf08f95914b))\r\n* Constrain protocol VK hashing\r\n([#9304](https://github.com/AztecProtocol/aztec-packages/issues/9304))\r\n([3d17e13](https://github.com/AztecProtocol/aztec-packages/commit/3d17e13260ae4dae36b803de4ee1d50d231b2e59))\r\n* **docs:** Nits\r\n([#8948](https://github.com/AztecProtocol/aztec-packages/issues/8948))\r\n([008fdd1](https://github.com/AztecProtocol/aztec-packages/commit/008fdd156ce212c65f8c83bef407eff0e30cb18e))\r\n* Eccvm translator zk sumcheck\r\n([#9199](https://github.com/AztecProtocol/aztec-packages/issues/9199))\r\n([c7d4572](https://github.com/AztecProtocol/aztec-packages/commit/c7d4572b49b33ee309f9238f3cec245878e6c295))\r\n* Gerousia\r\n([#8942](https://github.com/AztecProtocol/aztec-packages/issues/8942))\r\n([54b5ba2](https://github.com/AztecProtocol/aztec-packages/commit/54b5ba2aacf852f4f9454e67814d94322e88506b))\r\n* Get logs by tags\r\n([#9353](https://github.com/AztecProtocol/aztec-packages/issues/9353))\r\n([719c33e](https://github.com/AztecProtocol/aztec-packages/commit/719c33eec6bbcdf23926722518887de4d2cca8e3))\r\n* Handle reorgs on sequencer\r\n([#9201](https://github.com/AztecProtocol/aztec-packages/issues/9201))\r\n([d4dea16](https://github.com/AztecProtocol/aztec-packages/commit/d4dea162322eab233ed733aa318040e681cf5c70))\r\n* **interpreter:** Comptime derive generators\r\n(https://github.com/noir-lang/noir/pull/6303)\r\n([a166203](https://github.com/AztecProtocol/aztec-packages/commit/a166203a06c3e74096a9bc39000c4ee1615f85b8))\r\n* Introduce default public keys and replace empty public keys\r\n([#9277](https://github.com/AztecProtocol/aztec-packages/issues/9277))\r\n([47718ea](https://github.com/AztecProtocol/aztec-packages/commit/47718ea3a52468f5341a1203f70f48730faf9f7d))\r\n* Modify private calldata to use public keys\r\n([#9276](https://github.com/AztecProtocol/aztec-packages/issues/9276))\r\n([e42e219](https://github.com/AztecProtocol/aztec-packages/commit/e42e219d2ae0f0ee481ab9220023eb5a0f6a41bb))\r\n* New formatter (https://github.com/noir-lang/noir/pull/6300)\r\n([a166203](https://github.com/AztecProtocol/aztec-packages/commit/a166203a06c3e74096a9bc39000c4ee1615f85b8))\r\n* **nr:** Serde for signed ints\r\n([#9211](https://github.com/AztecProtocol/aztec-packages/issues/9211))\r\n([66f31c7](https://github.com/AztecProtocol/aztec-packages/commit/66f31c7b9d436405cd65072442a7c3da3674f340))\r\n* Publicly accessible bootstrap cache\r\n([#9335](https://github.com/AztecProtocol/aztec-packages/issues/9335))\r\n([28392d5](https://github.com/AztecProtocol/aztec-packages/commit/28392d5d4fe224aa1f10d526f2efcf2de97313ed))\r\n* Remove hash opcodes from AVM\r\n([#9209](https://github.com/AztecProtocol/aztec-packages/issues/9209))\r\n([e6db535](https://github.com/AztecProtocol/aztec-packages/commit/e6db535b69e6769fa3f2c85a0685640c92ac147b)),\r\ncloses\r\n[#9208](https://github.com/AztecProtocol/aztec-packages/issues/9208)\r\n* Sequencer cast votes\r\n([#9247](https://github.com/AztecProtocol/aztec-packages/issues/9247))\r\n([bd05d87](https://github.com/AztecProtocol/aztec-packages/commit/bd05d87891b9df0d0d537c4c1efcdf7d128a6a6f))\r\n* Sha256 refactoring and benchmark with longer input\r\n(https://github.com/noir-lang/noir/pull/6318)\r\n([a166203](https://github.com/AztecProtocol/aztec-packages/commit/a166203a06c3e74096a9bc39000c4ee1615f85b8))\r\n* **ssa:** Various mem2reg reverts to reduce memory and compilation time\r\n(https://github.com/noir-lang/noir/pull/6307)\r\n([a166203](https://github.com/AztecProtocol/aztec-packages/commit/a166203a06c3e74096a9bc39000c4ee1615f85b8))\r\n* Sync from aztec-packages (https://github.com/noir-lang/noir/pull/6301)\r\n([a166203](https://github.com/AztecProtocol/aztec-packages/commit/a166203a06c3e74096a9bc39000c4ee1615f85b8))\r\n* Translator on Shplemini\r\n([#9329](https://github.com/AztecProtocol/aztec-packages/issues/9329))\r\n([21fa3cf](https://github.com/AztecProtocol/aztec-packages/commit/21fa3cf054cf1a3652c8a27ddf042c1c48b47039))\r\n* TXE single execution env\r\n([#9183](https://github.com/AztecProtocol/aztec-packages/issues/9183))\r\n([1d1d76d](https://github.com/AztecProtocol/aztec-packages/commit/1d1d76d7a0ae6fb67825e3d82c59539438defc7c))\r\n* Warn about private types leaking in public functions and struct fields\r\n(https://github.com/noir-lang/noir/pull/6296)\r\n([a166203](https://github.com/AztecProtocol/aztec-packages/commit/a166203a06c3e74096a9bc39000c4ee1615f85b8))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* 4epochs kind test et al\r\n([#9358](https://github.com/AztecProtocol/aztec-packages/issues/9358))\r\n([e480e6b](https://github.com/AztecProtocol/aztec-packages/commit/e480e6b9a2e81ec19cbd0391a65bb3954771656f))\r\n* Allow array map on empty arrays\r\n(https://github.com/noir-lang/noir/pull/6305)\r\n([a166203](https://github.com/AztecProtocol/aztec-packages/commit/a166203a06c3e74096a9bc39000c4ee1615f85b8))\r\n* **avm:** Public dispatch in proving tests\r\n([#9331](https://github.com/AztecProtocol/aztec-packages/issues/9331))\r\n([42e5221](https://github.com/AztecProtocol/aztec-packages/commit/42e5221dda3fc28dc7fcce3607af756132b4e314))\r\n* Barretenberg readme scare warning\r\n([#9313](https://github.com/AztecProtocol/aztec-packages/issues/9313))\r\n([f759d55](https://github.com/AztecProtocol/aztec-packages/commit/f759d55d956fc0133ddec0db284de12b552b4c89))\r\n* Broken constants gen\r\n([#9387](https://github.com/AztecProtocol/aztec-packages/issues/9387))\r\n([eb7bc6b](https://github.com/AztecProtocol/aztec-packages/commit/eb7bc6b934e6d150daa4ad3315bcac33598e3650))\r\n* Ci github clone edge case\r\n([#9320](https://github.com/AztecProtocol/aztec-packages/issues/9320))\r\n([15abe6f](https://github.com/AztecProtocol/aztec-packages/commit/15abe6fe2f12450b7f40d859a394dec966132b0b))\r\n* **ci:** Report 4 epochs true\r\n([#9346](https://github.com/AztecProtocol/aztec-packages/issues/9346))\r\n([1ce0fa5](https://github.com/AztecProtocol/aztec-packages/commit/1ce0fa58d14c6b9b5f26f3cd3bda3589dd85b4e5))\r\n* Display function name and body when inlining recursion limit hit\r\n(https://github.com/noir-lang/noir/pull/6291)\r\n([a166203](https://github.com/AztecProtocol/aztec-packages/commit/a166203a06c3e74096a9bc39000c4ee1615f85b8))\r\n* Do not warn on unused self in traits\r\n(https://github.com/noir-lang/noir/pull/6298)\r\n([a166203](https://github.com/AztecProtocol/aztec-packages/commit/a166203a06c3e74096a9bc39000c4ee1615f85b8))\r\n* Enforce correctness of decompositions performed at compile time\r\n(https://github.com/noir-lang/noir/pull/6278)\r\n([a166203](https://github.com/AztecProtocol/aztec-packages/commit/a166203a06c3e74096a9bc39000c4ee1615f85b8))\r\n* Reject invalid expression with in CLI parser\r\n(https://github.com/noir-lang/noir/pull/6287)\r\n([a166203](https://github.com/AztecProtocol/aztec-packages/commit/a166203a06c3e74096a9bc39000c4ee1615f85b8))\r\n* Remove reliance on invalid decompositions in selector calculation\r\n([#9337](https://github.com/AztecProtocol/aztec-packages/issues/9337))\r\n([c8e4260](https://github.com/AztecProtocol/aztec-packages/commit/c8e4260efdd7f8a24b189800dcacedeb5e257562))\r\n* Support empty epochs\r\n([#9341](https://github.com/AztecProtocol/aztec-packages/issues/9341))\r\n([9dda91e](https://github.com/AztecProtocol/aztec-packages/commit/9dda91e59c4eba8e9b197617dc076d46e3e74459))\r\n* Use github.actor on publish workflow dispatch\r\n([#9324](https://github.com/AztecProtocol/aztec-packages/issues/9324))\r\n([5fa660d](https://github.com/AztecProtocol/aztec-packages/commit/5fa660d48ecd711a7445fa365ac6b677aeac93bf))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **avm:** Some cleaning in avm prover\r\n([#9311](https://github.com/AztecProtocol/aztec-packages/issues/9311))\r\n([523aa23](https://github.com/AztecProtocol/aztec-packages/commit/523aa231acd22228fa6414fc8241cebdfa21eafa))\r\n* Bump node types\r\n([#9397](https://github.com/AztecProtocol/aztec-packages/issues/9397))\r\n([763d5b1](https://github.com/AztecProtocol/aztec-packages/commit/763d5b1652e68290127a25e106fb3093a4325067))\r\n* Copying world state binary to yarn project is on generate\r\n([#9194](https://github.com/AztecProtocol/aztec-packages/issues/9194))\r\n([8d75dd4](https://github.com/AztecProtocol/aztec-packages/commit/8d75dd4a6730c1af27b23bc786ed9db8eb199e6f))\r\n* Disable bench-process-history\r\n([#9360](https://github.com/AztecProtocol/aztec-packages/issues/9360))\r\n([8e6734e](https://github.com/AztecProtocol/aztec-packages/commit/8e6734e0ba10f37d37a74c5bab9a35a7b515beb5))\r\n* **docs:** Refactoring guides and some other nits\r\n(https://github.com/noir-lang/noir/pull/6175)\r\n([a166203](https://github.com/AztecProtocol/aztec-packages/commit/a166203a06c3e74096a9bc39000c4ee1615f85b8))\r\n* Fix and re-enable prover coordination e2e test\r\n([#9344](https://github.com/AztecProtocol/aztec-packages/issues/9344))\r\n([3a1a62c](https://github.com/AztecProtocol/aztec-packages/commit/3a1a62cb84dc9457b58104e01ac358a2820159cb))\r\n* Implement Fq add\r\n([#9354](https://github.com/AztecProtocol/aztec-packages/issues/9354))\r\n([1711fac](https://github.com/AztecProtocol/aztec-packages/commit/1711fac844edabb02e71b5cc0b691742a19f85fd))\r\n* Minor test cleanup\r\n([#9339](https://github.com/AztecProtocol/aztec-packages/issues/9339))\r\n([a2ed567](https://github.com/AztecProtocol/aztec-packages/commit/a2ed567ad42b237088c110ce12ce8212d5099da2))\r\n* Print out gas at start and end of each enqueued call\r\n([#9377](https://github.com/AztecProtocol/aztec-packages/issues/9377))\r\n([29c0b95](https://github.com/AztecProtocol/aztec-packages/commit/29c0b956ae20b7c954cd514dfbf33753dfc0a53c))\r\n* Quick account manager refactor\r\n([#9357](https://github.com/AztecProtocol/aztec-packages/issues/9357))\r\n([648d043](https://github.com/AztecProtocol/aztec-packages/commit/648d043952f76ad0c2b7c536da2a59a7642a2cc2))\r\n* Quick keystore refactor\r\n([#9355](https://github.com/AztecProtocol/aztec-packages/issues/9355))\r\n([31b9999](https://github.com/AztecProtocol/aztec-packages/commit/31b9999cd8f533d262b5729229e0468550072ef9))\r\n* Redo typo PR by pucedoteth\r\n([#9385](https://github.com/AztecProtocol/aztec-packages/issues/9385))\r\n([fd1a0d1](https://github.com/AztecProtocol/aztec-packages/commit/fd1a0d1bdd64f69a08e39202658b46956e9a5254))\r\n* Release Noir(0.36.0) (https://github.com/noir-lang/noir/pull/6213)\r\n([a166203](https://github.com/AztecProtocol/aztec-packages/commit/a166203a06c3e74096a9bc39000c4ee1615f85b8))\r\n* Remove dead function (https://github.com/noir-lang/noir/pull/6308)\r\n([a166203](https://github.com/AztecProtocol/aztec-packages/commit/a166203a06c3e74096a9bc39000c4ee1615f85b8))\r\n* Remove delegate call and storage address\r\n([#9330](https://github.com/AztecProtocol/aztec-packages/issues/9330))\r\n([465f88e](https://github.com/AztecProtocol/aztec-packages/commit/465f88e9e89ac7af2ec8d4b061722dc3b776301e))\r\n* Remove noir_js_backend_barretenberg\r\n([#9338](https://github.com/AztecProtocol/aztec-packages/issues/9338))\r\n([cefe3d9](https://github.com/AztecProtocol/aztec-packages/commit/cefe3d901731d3b05de503ce93c97a3badf91363))\r\n* Remove unnecessary `is_integral_bit_size` function\r\n([#9352](https://github.com/AztecProtocol/aztec-packages/issues/9352))\r\n([ac8e6d7](https://github.com/AztecProtocol/aztec-packages/commit/ac8e6d707a13e1da7cf62f4922756ab674db6b07))\r\n* Remove usage of slices in pedersen hash\r\n(https://github.com/noir-lang/noir/pull/6295)\r\n([a166203](https://github.com/AztecProtocol/aztec-packages/commit/a166203a06c3e74096a9bc39000c4ee1615f85b8))\r\n* Replace relative paths to noir-protocol-circuits\r\n([32bd7b9](https://github.com/AztecProtocol/aztec-packages/commit/32bd7b9f334ce71bef0ee9a5e821be2b577d981e))\r\n* Replace relative paths to noir-protocol-circuits\r\n([add4605](https://github.com/AztecProtocol/aztec-packages/commit/add460559f90b020c01cb62fa52e91524e9b47b2))\r\n* Replace relative paths to noir-protocol-circuits\r\n([8cb89af](https://github.com/AztecProtocol/aztec-packages/commit/8cb89af84c0ab51b21892ecb021aadc001267674))\r\n* Replace usage of vector in keccakf1600 input with array\r\n([#9350](https://github.com/AztecProtocol/aztec-packages/issues/9350))\r\n([cb58490](https://github.com/AztecProtocol/aztec-packages/commit/cb58490eed9cc46a7b2039d93645a9456ee9c834))\r\n* Scenario for upgrading gerousia\r\n([#9246](https://github.com/AztecProtocol/aztec-packages/issues/9246))\r\n([66f59d6](https://github.com/AztecProtocol/aztec-packages/commit/66f59d64dfd52a57817ef887f8931d0c0aec4a2a))\r\n* Silence cache-download.sh\r\n([#9317](https://github.com/AztecProtocol/aztec-packages/issues/9317))\r\n([314d9d2](https://github.com/AztecProtocol/aztec-packages/commit/314d9d26ba00ce7efc3df0e040d612aacd5264b3))\r\n* Test 4epochs in native-network\r\n([#9309](https://github.com/AztecProtocol/aztec-packages/issues/9309))\r\n([ddb312a](https://github.com/AztecProtocol/aztec-packages/commit/ddb312ac266ef629280fe768ac5247eceea0f7a7))\r\n* Unstake the bond when the proof lands\r\n([#9363](https://github.com/AztecProtocol/aztec-packages/issues/9363))\r\n([b25b913](https://github.com/AztecProtocol/aztec-packages/commit/b25b9138da7d2a97b5e14934fb4edb911bc7fa22))\r\n* Update `noir-edwards` repo to point at `noir-lang` org\r\n(https://github.com/noir-lang/noir/pull/6323)\r\n([a166203](https://github.com/AztecProtocol/aztec-packages/commit/a166203a06c3e74096a9bc39000c4ee1615f85b8))\r\n* Updated NFT flows\r\n([#9150](https://github.com/AztecProtocol/aztec-packages/issues/9150))\r\n([407f8b4](https://github.com/AztecProtocol/aztec-packages/commit/407f8b448b0209e219afd83efe38a8e6b6cded06))\r\n</details>\r\n\r\n<details><summary>barretenberg: 0.60.0</summary>\r\n\r\n##\r\n[0.60.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.59.0...barretenberg-v0.60.0)\r\n(2024-10-24)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* replace usage of vector in keccakf1600 input with array\r\n([#9350](https://github.com/AztecProtocol/aztec-packages/issues/9350))\r\n* remove hash opcodes from AVM\r\n([#9209](https://github.com/AztecProtocol/aztec-packages/issues/9209))\r\n* remove delegate call and storage address\r\n([#9330](https://github.com/AztecProtocol/aztec-packages/issues/9330))\r\n\r\n### Features\r\n\r\n* **avm:** Full poseidon2\r\n([#9141](https://github.com/AztecProtocol/aztec-packages/issues/9141))\r\n([eae7587](https://github.com/AztecProtocol/aztec-packages/commit/eae75872fdd813ed07f70c1e5d41c7b9f399ab72))\r\n* Eccvm translator zk sumcheck\r\n([#9199](https://github.com/AztecProtocol/aztec-packages/issues/9199))\r\n([c7d4572](https://github.com/AztecProtocol/aztec-packages/commit/c7d4572b49b33ee309f9238f3cec245878e6c295))\r\n* Remove hash opcodes from AVM\r\n([#9209](https://github.com/AztecProtocol/aztec-packages/issues/9209))\r\n([e6db535](https://github.com/AztecProtocol/aztec-packages/commit/e6db535b69e6769fa3f2c85a0685640c92ac147b)),\r\ncloses\r\n[#9208](https://github.com/AztecProtocol/aztec-packages/issues/9208)\r\n* Translator on Shplemini\r\n([#9329](https://github.com/AztecProtocol/aztec-packages/issues/9329))\r\n([21fa3cf](https://github.com/AztecProtocol/aztec-packages/commit/21fa3cf054cf1a3652c8a27ddf042c1c48b47039))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* **avm:** Public dispatch in proving tests\r\n([#9331](https://github.com/AztecProtocol/aztec-packages/issues/9331))\r\n([42e5221](https://github.com/AztecProtocol/aztec-packages/commit/42e5221dda3fc28dc7fcce3607af756132b4e314))\r\n* Barretenberg readme scare warning\r\n([#9313](https://github.com/AztecProtocol/aztec-packages/issues/9313))\r\n([f759d55](https://github.com/AztecProtocol/aztec-packages/commit/f759d55d956fc0133ddec0db284de12b552b4c89))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **avm:** Some cleaning in avm prover\r\n([#9311](https://github.com/AztecProtocol/aztec-packages/issues/9311))\r\n([523aa23](https://github.com/AztecProtocol/aztec-packages/commit/523aa231acd22228fa6414fc8241cebdfa21eafa))\r\n* Copying world state binary to yarn project is on generate\r\n([#9194](https://github.com/AztecProtocol/aztec-packages/issues/9194))\r\n([8d75dd4](https://github.com/AztecProtocol/aztec-packages/commit/8d75dd4a6730c1af27b23bc786ed9db8eb199e6f))\r\n* Remove delegate call and storage address\r\n([#9330](https://github.com/AztecProtocol/aztec-packages/issues/9330))\r\n([465f88e](https://github.com/AztecProtocol/aztec-packages/commit/465f88e9e89ac7af2ec8d4b061722dc3b776301e))\r\n* Remove noir_js_backend_barretenberg\r\n([#9338](https://github.com/AztecProtocol/aztec-packages/issues/9338))\r\n([cefe3d9](https://github.com/AztecProtocol/aztec-packages/commit/cefe3d901731d3b05de503ce93c97a3badf91363))\r\n* Replace usage of vector in keccakf1600 input with array\r\n([#9350](https://github.com/AztecProtocol/aztec-packages/issues/9350))\r\n([cb58490](https://github.com/AztecProtocol/aztec-packages/commit/cb58490eed9cc46a7b2039d93645a9456ee9c834))\r\n</details>\r\n\r\n---\r\nThis PR was generated with [Release\r\nPlease](https://github.com/googleapis/release-please). See\r\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2024-10-24T13:43:34-04:00",
          "tree_id": "66874c95e290de7d015ab045990d0ddd84f32869",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/09c9ad894ad64f44c25c191004273ae2828186d5"
        },
        "date": 1729793466999,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30774.666844000025,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29319.524564000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5333.8974930000095,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4982.736344 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92699.23295699999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92699235000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15136.644877000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15136644000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2711363678,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2711363678 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127090385,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127090385 ns\nthreads: 1"
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
          "id": "07d6dc29db2eb04154b8f0c66bd1efa74c0e8b9d",
          "message": "feat(avm): avm replace zeromorph pcs by shplemini (#9389)\n\nResolves #9349 \r\n\r\nNative proving and verification time did not change significantly on\r\nbulk tests. Before and after this PR, we get\r\n\r\n- pcs step proving time: 2.1 sec\r\n- pcs verification step time: 50 ms\r\n\r\nRecursive verifier num of gates decreased of about 6.5%:\r\n5312325 --> 4971289",
          "timestamp": "2024-10-24T20:53:32+02:00",
          "tree_id": "0b0d18b47d6f02dbceba7e49cf9e2928a2c8f8fa",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/07d6dc29db2eb04154b8f0c66bd1efa74c0e8b9d"
        },
        "date": 1729798484431,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30889.758760000008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29138.890123 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5377.372792000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5064.886341 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92767.986846,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92767988000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15213.389192,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15213388000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2705592999,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2705592999 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126087037,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126087037 ns\nthreads: 1"
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
          "id": "84fdc526f73027a3450bcdcc78b826fc9da8df88",
          "message": "feat: Print finalized size and log dyadic size during Ultra proof construction (#9411)\n\nYou can now see the circuit sizes in the e2e full prover test.",
          "timestamp": "2024-10-24T17:47:24-04:00",
          "tree_id": "8675acf321f92640b1831bb006457a0e8b411c25",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/84fdc526f73027a3450bcdcc78b826fc9da8df88"
        },
        "date": 1729808116794,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30847.066788999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29225.964655000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5372.882576000009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5038.989699000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 94092.438965,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 94092441000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15161.680561,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15161680000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2717535451,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2717535451 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126186669,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126186669 ns\nthreads: 1"
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
          "id": "2bb09e59f648e6182f1097d283451afd3c488d27",
          "message": "feat: bytecode hashing init (#8535)\n\nThis adds proper computation of the public bytecode commitment (i.e.\r\npair-wise poseidon hashing of the public bytecode). This hash is also\r\ncomputed in the witgen although the circuit remains unconstrained.\r\n\r\nFollow up PRs will handle:\r\n1) Deriving class id, including tracing and hinting the artifact hash,\r\netc\r\n2) Deriving the address, including tracing and hinting the contract\r\ninstance\r\n3) Merkle path hinting and verification in the AVM",
          "timestamp": "2024-10-25T15:13:41+01:00",
          "tree_id": "d531be1b3de5d89fef81d95a0648210ccf98db24",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2bb09e59f648e6182f1097d283451afd3c488d27"
        },
        "date": 1729867261557,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30828.311361999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28952.089779 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5348.9558649999935,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5002.027076 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 93254.62796800002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 93254630000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15220.061291,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15220061000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2715364570,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2715364570 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128242637,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128242637 ns\nthreads: 1"
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
          "id": "84205d872067345239913914a84b708d05d8364c",
          "message": "feat(avm): trace contract class and contract instance (#8840)\n\nThis PR is centred around tracing and passing contract class & instance\r\nduring simulator execution and passing it to circuit. We store each\r\ncontract class & instance whenever the `simulator` calls `getBytecode`.\r\n\r\nThis changes the input interface to the bb binary - we no longer take in\r\na specific bytecode to execute. Instead we get a vector of\r\n`{contract_class, contract_instance, bytecode}` which define all the\r\n(deduplicated) contract bytecode that will be executed during this\r\n\"one-enqueued call\" (actual implementation of 1-enqueued call tbd).\r\n\r\nThis doesnt do any derivation of id or address yet",
          "timestamp": "2024-10-25T15:53:25+01:00",
          "tree_id": "b2cb91e82c38f735658e88c9d312338fdd07b567",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/84205d872067345239913914a84b708d05d8364c"
        },
        "date": 1729870683281,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30824.063572999876,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28977.064539 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5357.160063000038,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5041.958132999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 90897.220161,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 90897222000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15185.878856999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15185879000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2702632818,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2702632818 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126158558,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126158558 ns\nthreads: 1"
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
          "id": "1bbd724eab39c193c1db1d89570eab9358563fe2",
          "message": "feat(avm/brillig)!: revert/rethrow oracle (#9408)\n\nThis PR introduces a revert oracle to be used when (and only when) rethrowing revertdata in public. The major difference with just doing `assert(false, data)` is that the latter will also add an error selector to the revertdata, which is not something we want when rethrowing.\n\n* Creates a revert oracle to be used for rethrowing.\n* Changes TRAP/REVERT to have a runtime size.",
          "timestamp": "2024-10-25T17:49:12+01:00",
          "tree_id": "a8b966ca306aeb646254cf62ceac303f6e24ed2f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1bbd724eab39c193c1db1d89570eab9358563fe2"
        },
        "date": 1729877432315,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30762.430378999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28925.057473 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5337.910193999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4996.069336 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92085.686835,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92085688000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15183.141846,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15183141000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2704906561,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2704906561 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126613305,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126613305 ns\nthreads: 1"
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
          "id": "a67d0e2122945998119a8643a4fb4e74fccc7f34",
          "message": "chore(avm): Allocate memory for unshifted polynomials according to their trace col size (#9345)\n\nSome measurements on bulk test showed that resident memory during\r\nproving went from 33.1 GB to 28.4 GB.",
          "timestamp": "2024-10-25T20:12:45+02:00",
          "tree_id": "30e462f146708fab2680cc20bd1656dd762dde12",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a67d0e2122945998119a8643a4fb4e74fccc7f34"
        },
        "date": 1729881445642,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30837.070517,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29067.204898 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5345.56532500001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5017.449989 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91926.988729,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91926991000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15167.119286,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15167119000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2699587404,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2699587404 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126754976,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126754976 ns\nthreads: 1"
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
          "id": "91c50dd6c52bc95aab4748d022516fc1b5fd5fe6",
          "message": "chore: bumping L2 gas and public reads constants (#9431)",
          "timestamp": "2024-10-25T14:15:13-04:00",
          "tree_id": "af82cf552f2aa75d985e2a8eb15a1cca8e939709",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/91c50dd6c52bc95aab4748d022516fc1b5fd5fe6"
        },
        "date": 1729882346645,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30777.122819,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28831.392146 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5355.669605999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5031.694933 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91979.21608299999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91979217000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15098.008913000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15098010000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2730645173,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2730645173 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128342368,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128342368 ns\nthreads: 1"
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
          "id": "2ebe3611ad3826443b31e5626a4e08cdd90f0f2a",
          "message": "feat: derive address and class id in avm (#8897)\n\nthis PR adds tracing of the class id and contract instance when\r\n`getBytecode` (indicating a new context execution is happening in the\r\nsimulator) is executed.\r\n\r\nWe now derive the class id and the contract address in witgen, plus\r\nbuild the (unconstrained) circuit for:\r\n\r\n1. the raw bytecode bytes, \r\n2. the field encoded version\r\n3. the bytecode hash derivation\r\n\r\nThe circuit elements of the contract class id and address will be done\r\nin a follow up based on how we tackle nullifier request",
          "timestamp": "2024-10-26T18:26:04-04:00",
          "tree_id": "f4513cd797fd8196c605a219cff91b00a1e98364",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2ebe3611ad3826443b31e5626a4e08cdd90f0f2a"
        },
        "date": 1729983285888,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30830.65084100002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28893.521361 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5360.253768999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5060.213106 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92563.331494,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92563333000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15140.094836,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15140095000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2710663305,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2710663305 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127831682,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127831682 ns\nthreads: 1"
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
          "id": "a85f92a24f4ec988a4d472651a0e2827bf9381b2",
          "message": "fix(avm): address bytecode hashing comments (#9436)\n\nFixing up some earlier comments in PRs",
          "timestamp": "2024-10-27T11:02:14-04:00",
          "tree_id": "f761e5c091bdc9b4cc03392f11c26094006ff8b9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a85f92a24f4ec988a4d472651a0e2827bf9381b2"
        },
        "date": 1730042864242,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30814.117400000014,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29016.342338 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5391.582382999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5046.063061 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92493.65878499999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92493662000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15181.880702999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15181880000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2712424423,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2712424423 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126163766,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126163766 ns\nthreads: 1"
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
          "id": "29b692f9e81e1ee809e37274cf6ac2ab0ca526ce",
          "message": "feat!: getcontractinstance instruction returns only a specified member (#9300)\n\n`GETCONTRACTINSTANCE` now takes member enum as immediate operand and\r\nwrites/returns a single field from the contract instance. Also\r\nwrites/returns a u1/bool for \"exists\".\r\n\r\nChanged the trace to accept (separately) address, exists,\r\ncontractInstance since the trace generally operates on lower-level\r\ntypes, not structs.\r\n\r\nNoir has a different oracle for each enum value (similar to the `GETENV`\r\nvariations).",
          "timestamp": "2024-10-27T17:49:52Z",
          "tree_id": "69a14d67e1ace06d7ce342a0e15e9de6b1e95f95",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/29b692f9e81e1ee809e37274cf6ac2ab0ca526ce"
        },
        "date": 1730053034899,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30826.452797,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29056.790563 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5341.396951999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4997.648776 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91744.004195,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91744007000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15110.163371,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15110162000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2707414199,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2707414199 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 124794973,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 124794973 ns\nthreads: 1"
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
          "id": "8e07de8233929d40a433a80064ceec30a69c1360",
          "message": "chore(avm:): Fix execution tests in proving mode (#9466)\n\nThis will fix failures in:\r\nhttps://github.com/AztecProtocol/aztec-packages/actions/runs/11547299961",
          "timestamp": "2024-10-28T09:49:39Z",
          "tree_id": "3ef5a856fd0482bb8b368b6951520fe99f8bee35",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8e07de8233929d40a433a80064ceec30a69c1360"
        },
        "date": 1730110862785,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30765.77651100001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28825.568314999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5365.104804000012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5064.249232 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92651.39496100001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92651397000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15148.522228999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15148523000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2715504396,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2715504396 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127042197,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127042197 ns\nthreads: 1"
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
          "id": "d52b616a91224c25f24a00b76b984f059c103dcb",
          "message": "feat(avm): merkle tree gadget (#9205)\n\nResolves https://github.com/AztecProtocol/aztec-packages/issues/9458",
          "timestamp": "2024-10-28T10:43:35Z",
          "tree_id": "9c45bacaefc8b266b166fa5a3cca66d6f65c47d1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d52b616a91224c25f24a00b76b984f059c103dcb"
        },
        "date": 1730114617498,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30795.84886699999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29016.224961000004 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5332.517873000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5015.26463 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91700.982917,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91700985000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15115.508313999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15115507000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2712728625,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2712728625 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125876914,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125876914 ns\nthreads: 1"
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
          "id": "8658abd46612d3fdf8c8b54902c201c790a52345",
          "message": "feat: fixed number of pub inputs for databus commitment propagation (#9336)\n\nThis work is motivated by the need to have a \"write vk\" method for\r\nkernel circuits that depends only on acir constraints (no witness data\r\nor historical data about the previously accumulated circuits). This is\r\nmade difficult by the inter-circuit databus consistency check mechanism\r\nwhich, until now, added structure to a present circuit based on the\r\nstructure of previous circuits. This PR makes updates to the mechanism\r\nso that the constraints associated with the databus consistency checks\r\nare consistent across all kernel circuits. There are two components to\r\nthis:\r\n\r\n(1) Every kernel propagates 2 commitments worth of data (one for app\r\nreturn data, one for kernel return data) on its public inputs.\r\n(Previously this was allowed to be 0, 1 or 2 depending on the number of\r\nrecursive verifications performed by the kernel). If data does not exist\r\nfor either of these (e.g. if the kernel is only verifying a proof of one\r\nor the other), a default value is propagated. (This value is set to\r\nmatch the commitment to the \"empty\" calldata that will correspond to the\r\nmissing return data).\r\n\r\n(2) Every kernel performs two commitment consistency checks: one that\r\nchecks that the app `return_data` is equal to the `secondary_calldata`\r\nand one that checks that the previous kernel `return_data` is equal to\r\nthe `calldata`. (Previously there could be 0, 1, or 2 such checks\r\ndepending on the data propagated on the public inputs of the kernel\r\nbeing recursively verified - hence the need for knowledge of history /\r\nwitness data).\r\n\r\nCloses https://github.com/AztecProtocol/barretenberg/issues/1125 (had to\r\ndo with dynamically determining the number of public inputs associated\r\nwith databus commitments which is now fixed in size to 16).",
          "timestamp": "2024-10-28T07:42:16-07:00",
          "tree_id": "ba603d89606afceb8d617f12a28cec086931da61",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8658abd46612d3fdf8c8b54902c201c790a52345"
        },
        "date": 1730128864710,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30866.215102000013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29142.921290000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5351.697946000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5064.016449999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91351.84189,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91351844000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15169.656309999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15169656000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2686004829,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2686004829 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125664065,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125664065 ns\nthreads: 1"
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
          "id": "1c0275db18510fd7d55b400e4a910447859f4acc",
          "message": "feat: sol shplemini in acir tests + contract_gen (#8874)",
          "timestamp": "2024-10-29T06:22:55Z",
          "tree_id": "7956c29b8160ef536a438df9b558251d3bba5887",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1c0275db18510fd7d55b400e4a910447859f4acc"
        },
        "date": 1730184662283,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30877.837845999977,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29177.465247 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5347.561196000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5005.999544 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92530.160855,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92530163000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15157.737312,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15157738000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2709076827,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2709076827 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127908149,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127908149 ns\nthreads: 1"
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
          "id": "7c2d67a7c63a2b05d8f8d48b1690c87e8bacfc49",
          "message": "chore: align debug logging between AVM sim & witgen (#9498)",
          "timestamp": "2024-10-29T08:51:47+01:00",
          "tree_id": "1b58bf437fc3645ee06c3612ee2e354ecb1b2a34",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7c2d67a7c63a2b05d8f8d48b1690c87e8bacfc49"
        },
        "date": 1730190735237,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31000.684504999983,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29207.877119 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5385.0720280000105,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5059.5087650000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 93101.393078,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 93101395000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15322.41921,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15322419000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2695476910,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2695476910 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126755173,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126755173 ns\nthreads: 1"
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
      }
    ]
  }
}