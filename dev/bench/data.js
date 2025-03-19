window.BENCHMARK_DATA = {
  "lastUpdate": 1742398755907,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "C++ Benchmark": [
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
          "id": "fc597f4a6462902a345e6e879bf809634c0b83ed",
          "message": "fix: Cl/release fixes 2 (#12595)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-03-08T08:53:31Z",
          "tree_id": "299f9eff7dd5689cd209adde03b29f347ebd8732",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fc597f4a6462902a345e6e879bf809634c0b83ed"
        },
        "date": 1741426110349,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18644.787049999875,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16446.13983 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18912.583480999958,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16475.836974 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3998.780221000061,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3070.2482889999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55242.998212,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55242999000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9782.445214,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9782452000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1627558617,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1627558617 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 229658662,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 229658662 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "fdcfcaf5553a39c1d8b0e09fff3f9951171487d8",
          "message": "fix: Cl/release noir refs (#12597)\n\nAll references to `@noir-lang/` are replaced with `@aztec/noir-` as we\nare releasing our own build of the packages.",
          "timestamp": "2025-03-08T20:07:36Z",
          "tree_id": "085b1ad70b13b827218850285e9fbd6be4557869",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fdcfcaf5553a39c1d8b0e09fff3f9951171487d8"
        },
        "date": 1741466523018,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18304.6532190001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16170.986022000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19061.589800999856,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16663.422752 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3951.4767949999623,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3111.799929 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55721.636293,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55721637000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10818.002165,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10818008000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1625235750,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1625235750 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 214123328,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 214123328 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "106527861+sthwnd@users.noreply.github.com",
            "name": "Lisa",
            "username": "sthwnd"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "d45dac9b69c55cdaaffb648350fbdf09972ba9d4",
          "message": "chore(docs): Updated accounts page (#12019)\n\ncloses https://github.com/AztecProtocol/aztec-packages/issues/10498\n\n---------\n\nCo-authored-by: Cat McGee <helloworld@mcgee.cat>\nCo-authored-by: Rahul Kothari <rahul.kothari.201@gmail.com>\nCo-authored-by: josh crites <critesjosh@gmail.com>\nCo-authored-by: josh crites <jc@joshcrites.com>",
          "timestamp": "2025-03-10T11:31:44+02:00",
          "tree_id": "68580536d53ab9555910204d513e8e8e706759dd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d45dac9b69c55cdaaffb648350fbdf09972ba9d4"
        },
        "date": 1741601433198,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18488.02552799998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16215.443111000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18988.339747000282,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16468.885732 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3909.9979989996427,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3125.8927259999996 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55798.450211999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55798450000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11084.440498,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11084447000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1610527221,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1610527221 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 214865419,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 214865419 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
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
          "id": "877de5c4e3fcfdad915f2fbb065611d5b54c93b5",
          "message": "feat: allow to pay via sponsored fpc from cli (#12598)\n\nUse option `--payment method=fpc-sponsored,fpc=0x_address_of_the_fpc` to\npay fee via a sponsored fpc.\n\nOr see an example\n[here](https://github.com/AztecProtocol/aztec-packages/pull/12598/files#diff-a019e1f3bfc94f752f40c182e5bb3bff43a63f2bacd7b540a9b891de969eee68)\nfor deploying and funding a sponsored fpc.",
          "timestamp": "2025-03-10T11:35:07Z",
          "tree_id": "8e20ebff66cb7d9218a87d9b0d299b7f9549e5ef",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/877de5c4e3fcfdad915f2fbb065611d5b54c93b5"
        },
        "date": 1741608314516,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18569.91765399994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16342.938337 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18736.785947000044,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16272.432259000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3912.335743000085,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3082.098904 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54859.056244,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54859056000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9524.878568,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9524882000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1600520393,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1600520393 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 217640032,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 217640032 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
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
          "distinct": true,
          "id": "239a4fbb285329c120b2e588eed0c8ab58395066",
          "message": "docs: update cli-wallet commands in profiler doc (#12568)\n\nTo handle fee enforcement",
          "timestamp": "2025-03-10T12:05:14Z",
          "tree_id": "aff542085b10990d3e8e3e76bb0825ed6381003f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/239a4fbb285329c120b2e588eed0c8ab58395066"
        },
        "date": 1741609201639,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18177.069368999924,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15990.020364 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18778.190832000066,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16308.252012 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3873.230347000117,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 2981.3488239999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54699.834787,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54699834000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11089.772887000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11089780000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1600490151,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1600490151 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 218208943,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 218208943 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
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
          "distinct": true,
          "id": "657299bfa0addf1279051d55a47289574536986a",
          "message": "feat: Resolve callstacks in protocol circuit errors on wasm (#12573)\n\nIf you face an error in a protocol circuit, you can bootstrap with\nDEBUG=1 and the noir call stack should be resolved now:\n```\n[14:50:16.470] ERROR: pxe:service Error: Error: Circuit execution failed: push out of bounds\n    at Object.<anonymous>.module.exports.__wbg_constructor_c456dcccc52847dd (/mnt/user-data/alvaro/aztec-packages-2/noir/packages/acvm_js/nodejs/acvm_js.js:563:17)\n    at __wbg_constructor_c456dcccc52847dd externref shim (wasm://wasm/acvm_js.wasm-0094b602:1:1581928)\n    at acvm_js::js_execution_error::JsExecutionError::new::h93c0d36e943058c5 (wasm://wasm/acvm_js.wasm-0094b602:1:1194110)\n    at acvm_js::execute::ProgramExecutor<B>::execute_circuit::{{closure}}::he0b31dde1fab7349 (wasm://wasm/acvm_js.wasm-0094b602:1:428587)\n    at acvm_js::execute::execute_program_with_native_program_and_return::{{closure}}::h907e9f3645570aaa (wasm://wasm/acvm_js.wasm-0094b602:1:1064646)\n    at acvm_js::execute::execute_program_with_native_type_return::{{closure}}::hda8478769597cad2 (wasm://wasm/acvm_js.wasm-0094b602:1:1142954)\n    at wasm_bindgen_futures::future_to_promise::{{closure}}::{{closure}}::hb42baa03d2f91f89 (wasm://wasm/acvm_js.wasm-0094b602:1:995186)\n    at wasm_bindgen_futures::queue::Queue::new::{{closure}}::he554c69357740b54 (wasm://wasm/acvm_js.wasm-0094b602:1:1288461)\n    at <dyn core::ops::function::FnMut<(A,)>+Output = R as wasm_bindgen::closure::WasmClosure>::describe::invoke::h01c6856463f9cac8 (wasm://wasm/acvm_js.wasm-0094b602:1:1580227)\n    at closure265 externref shim (wasm://wasm/acvm_js.wasm-0094b602:1:1583586)\n    at __wbg_adapter_30 (/mnt/user-data/alvaro/aztec-packages-2/noir/packages/acvm_js/nodejs/acvm_js.js:531:10)\n    at real (/mnt/user-data/alvaro/aztec-packages-2/noir/packages/acvm_js/nodejs/acvm_js.js:125:20)\n    at node:internal/process/task_queues:140:7\n    at AsyncResource.runInAsyncScope (node:async_hooks:203:9)\n    at AsyncResource.runMicrotask (node:internal/process/task_queues:137:8) {\n  callStack: [ '0.2691', '0.18971', '0.20148' ],\n  rawAssertionPayload: { selector: '5727012404371710682', data: [] },\n  brilligFunctionId: 0,\n  noirCallStack: [\n    'at private_inputs.execute (/home/aztec-dev/aztec-packages/noir-projects/noir-protocol-circuits/crates/private-kernel-inner-simulated/src/main.nr:19:5)',\n    'at self.generate_output (/home/aztec-dev/aztec-packages/noir-projects/noir-protocol-circuits/crates/private-kernel-lib/src/private_kernel_inner.nr:58:31)',\n    'at PrivateKernelCircuitPublicInputsComposer::new_from_previous_kernel(\\n' +\n      '            self.previous_kernel.public_inputs,\\n' +\n      '        )\\n' +\n      '            .pop_top_call_request()\\n' +\n      '            .with_private_call (/home/aztec-dev/aztec-packages/noir-projects/noir-protocol-circuits/crates/private-kernel-lib/src/private_kernel_inner.nr:42:9)',\n    'at self.propagate_from_private_call (/home/aztec-dev/aztec-packages/noir-projects/noir-protocol-circuits/crates/private-kernel-lib/src/components/private_kernel_circuit_public_inputs_composer.nr:129:9)',\n    'at self.propagate_logs (/home/aztec-dev/aztec-packages/noir-projects/noir-protocol-circuits/crates/private-kernel-lib/src/components/private_kernel_circuit_public_inputs_composer.nr:159:9)',\n    'at self.public_inputs.end.private_logs.push (/home/aztec-dev/aztec-packages/noir-projects/noir-protocol-circuits/crates/private-kernel-lib/src/components/private_kernel_circuit_public_inputs_composer.nr:299:17)',\n    'at self.len < MaxLen (std/collections/bounded_vec.nr:187:16)'\n  ]\n}\n```",
          "timestamp": "2025-03-10T13:27:52+01:00",
          "tree_id": "4b6d8611fccb7d8a173d0776a37c5b5af30f46f8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/657299bfa0addf1279051d55a47289574536986a"
        },
        "date": 1741612448282,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18214.376096999786,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15977.578339999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18885.34940999989,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16421.952672 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3858.272507000038,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3051.448113000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55206.786960000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55206788000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11099.65623,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11099659000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1603849045,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1603849045 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 227499424,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 227499424 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "jose@aztecprotocol.com",
            "name": "José Pedro Sousa",
            "username": "signorecello"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "2d7b69d1227b9cc6b6aac69db0323c5d8ffd4d82",
          "message": "chore(testnet): updating script for ignition, change naming (#12566)\n\nThanks @aminsammara for coordinating changes while I was out in Denver\n:)\n\n---------\n\nCo-authored-by: signorecello <outgoing@zkpedro.dev>",
          "timestamp": "2025-03-10T13:58:01+01:00",
          "tree_id": "1f5680967adfcf2e2e7b8a7cf5142555817c18b3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2d7b69d1227b9cc6b6aac69db0323c5d8ffd4d82"
        },
        "date": 1741613293217,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18284.574928999973,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16121.861261 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18891.734326999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16403.71243 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3890.1294280001366,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3074.790184 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55057.022675,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55057024000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10192.004469999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10192011000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1605618303,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1605618303 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 218473638,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 218473638 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
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
          "distinct": true,
          "id": "6a4156551cdd404dcefb9186aea0cdab47cef484",
          "message": "feat: aztec-up -v flag (#12590)\n\n\n---------\n\nCo-authored-by: ludamad <adam.domurad@gmail.com>",
          "timestamp": "2025-03-10T13:10:59Z",
          "tree_id": "23c6329511b6c61129ace0e42686f97a3a33660b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6a4156551cdd404dcefb9186aea0cdab47cef484"
        },
        "date": 1741614068429,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18132.78301499986,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15991.428209999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18661.325175,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16392.760039999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3862.9052449998653,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 2985.9771410000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54505.713345000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54505715000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9560.696302,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9560698000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1594906610,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1594906610 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 218477743,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 218477743 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "9578f1ef2122fa31fa35385d52219736b7809c7b",
          "message": "chore: Validate blobs posted to sink belong to our L2 (#12587)\n\nAdds an optional L1 execution rpc url to the blob sink. When set, any\nincoming blobs are checked against the rollup contract\n`L2BlockPublished` events for the given block. If not set, the post is\ndiscarded.\n\nFixes #12497",
          "timestamp": "2025-03-10T13:17:21Z",
          "tree_id": "a41599dcd310c1e80fe999471e3b4c43adc9ef1b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9578f1ef2122fa31fa35385d52219736b7809c7b"
        },
        "date": 1741615084178,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18395.615841000108,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16064.958965999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19005.25201599976,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16525.467258000004 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3924.5833279996987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3094.4380109999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55383.09722299999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55383098000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11433.475961,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11433480000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1601980499,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1601980499 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 218007656,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 218007656 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
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
          "id": "bd0b3b69c57e9ed225b3a8b8e5dfba65edb31977",
          "message": "fix!: aggregate data for batch calls (#12562)\n\n- `BatchCall` now takes an array of `BaseContractInteraction`, which has\nall the information including `functionCall`, `authwit` and `capsules`.\nBefore it took an array of `functionCall` and users would have to set\nother data to it seperately.\n- `BaseContractInteraction` has a method `request` that returns\n`<Omit<ExecutionRequestInit, 'fee'>>`. This is called by `BatchCall` to\ngather all the data, and used for simulation to estimate fee.",
          "timestamp": "2025-03-10T14:02:59Z",
          "tree_id": "2cc532c69da3761e332ae1389e0cd600c118b6bd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/bd0b3b69c57e9ed225b3a8b8e5dfba65edb31977"
        },
        "date": 1741617779048,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18293.49905500021,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16220.779099999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18989.844000000176,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16379.084727000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3950.8375239997804,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3091.9362690000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55542.255637,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55542255000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10520.341719999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10520350000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1605785753,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1605785753 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 217209269,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 217209269 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "abd22cd21ce7201583f897c70591503a77db519a",
          "message": "feat(bb): consider polynomial end_index when constructing partially evaluated multivariates (#12530)\n\nThis fixes the sumcheck memory peak.\n\nTakes AVM memory usage for a trivial transaction from `33GB` (projected `100GB` on full VM) to `5GB`.\n\nHopefully also useful for other flavors, when the trace is not full.\n\nBTW, this also gives a massive sumcheck performance gain\n* AVM (16 cores, short trace) - Before: 9s\n* AVM (16 cores, short trace) - After: 3s\n\nPartly due to less memory allocation (and Fr zeroing) and partly due to @jeanmon's suggestions.",
          "timestamp": "2025-03-10T16:03:35Z",
          "tree_id": "48a56f1a668cfcc4d96609f59137fc6f4faccb33",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/abd22cd21ce7201583f897c70591503a77db519a"
        },
        "date": 1741625534919,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18365.208806999817,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16049.461823000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18804.653215000144,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16267.076668000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3958.6665199999516,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3100.775792 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55332.974456,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55332974000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10303.252193,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10303258000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1634785392,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1634785392 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 229850698,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 229850698 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
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
          "id": "f2c06c2ccab8b980defe72d82db1b631c6994f91",
          "message": "fix: deploy method test (#12609)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-03-10T16:27:33Z",
          "tree_id": "9f47e5f5635e57cd9364d171829e7d5ecf56d85d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f2c06c2ccab8b980defe72d82db1b631c6994f91"
        },
        "date": 1741626297925,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18484.70505099999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16078.108377999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18888.524552000035,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16473.604826 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3890.968423000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3126.774097 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55842.75302800001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55842756000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9255.599645,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9255602000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1615053909,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1615053909 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 212926105,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 212926105 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
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
          "distinct": true,
          "id": "955f1b0176057af46479e8146f22c052651c16c8",
          "message": "chore(sandbox): expose anvil port (#12599)\n\n## Overview\n\nExpose anvil port in sandbox, currently the eth node is unaccesible",
          "timestamp": "2025-03-10T16:36:08Z",
          "tree_id": "e8fe7f6f10b4dc23c21dc0f5e889b948415e9415",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/955f1b0176057af46479e8146f22c052651c16c8"
        },
        "date": 1741626631617,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17970.152333999977,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15887.910096 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18747.722703000138,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16136.70488 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3842.1370139999453,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3086.442171 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55133.67860399999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55133679000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10744.509751,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10744513000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1606273463,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1606273463 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 222356462,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 222356462 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "c296422e43f47fa9838045bc4faf933893046028",
          "message": "feat: add extra attributes to target_info (#12583)\n\nThis PR adds slot duration (in seconds), epoch size (in slots) and the\nl1 address (if it exists) to `target_info` metric.",
          "timestamp": "2025-03-10T16:40:02Z",
          "tree_id": "477a97f1c21dd3dec5462717209398954b6db8fa",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c296422e43f47fa9838045bc4faf933893046028"
        },
        "date": 1741626874101,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18131.84106899985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16079.386195000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18683.811452999864,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16162.178574999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3833.61777600021,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3014.9587850000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55087.079861,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55087081000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9669.830038,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9669833000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1631204073,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1631204073 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 231521308,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 231521308 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
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
          "distinct": true,
          "id": "adceed689cd8e47e2fa35bfd8aeb931d6bdc0ff7",
          "message": "chore: Fix mac build (#12610)",
          "timestamp": "2025-03-10T15:12:18-04:00",
          "tree_id": "a1a7a59cab2ae89b7dcf65bc5543954d60f657c1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/adceed689cd8e47e2fa35bfd8aeb931d6bdc0ff7"
        },
        "date": 1741636176304,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18444.927564999944,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16233.764576999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18865.053209000052,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16306.015469000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3986.4744040000915,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3094.7765569999992 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55837.185196,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55837186000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10945.382119,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10945386000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1618792074,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1618792074 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 224780459,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 224780459 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "6e919344d7e48695d07e154ce63cefae8cb7a6aa",
          "message": "fix: broken kind transfer test (#12611)\n\nFixes the misconfigured volumes on the blob sink, hit in the kind\ntransfer test.\n\nAlso the flake rate on kind tests is close to zero, so graduating them.",
          "timestamp": "2025-03-10T20:43:24Z",
          "tree_id": "9b410501d66800339a8d7cf935adc3d0a254b1b2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6e919344d7e48695d07e154ce63cefae8cb7a6aa"
        },
        "date": 1741640235997,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17939.56865100006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15818.87192 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18517.624801000013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16115.565557 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3766.241662000084,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3029.0189630000004 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55029.951515,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55029950000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11729.380698,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11729384000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1585792135,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1585792135 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 212692237,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 212692237 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
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
          "id": "add9d35333e59d4fce2042bc5f28abdbe0d330b0",
          "message": "chore: more sane e2e_prover/full timeout (#12619)",
          "timestamp": "2025-03-10T19:13:38-04:00",
          "tree_id": "2f398962e5125f1462dafc064abb5e702e1220f4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/add9d35333e59d4fce2042bc5f28abdbe0d330b0"
        },
        "date": 1741650211863,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18143.308039999967,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16083.432615000003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18631.567469999936,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16386.806 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3870.299487000011,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3050.449951 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55063.059831,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55063060000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11125.860166,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11125863000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1610510825,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1610510825 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 224787125,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 224787125 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "d930c0152bf1eb401b996006d247897b004c5b8d",
          "message": "fix: get L1 tx utils config from env (#12620)\n\nensure l1 tx utils config is taken from env when deploying any L1\ncontracts",
          "timestamp": "2025-03-10T23:28:20Z",
          "tree_id": "f494b977442e31dddd3bdde236b00c0d1d9cd17d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d930c0152bf1eb401b996006d247897b004c5b8d"
        },
        "date": 1741651487159,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18271.240782000175,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16161.214246 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18736.709867000172,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16347.725641 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3911.3935240000046,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3040.5240590000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55427.921905,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55427922000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9319.499147,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9319503000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1704721410,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1704721410 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 234740635,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 234740635 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
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
          "id": "9ac518b4ca154a37ae625bc8d53df2982ce18d61",
          "message": "chore(ci3): add helper for uncached test introspection (#12618)",
          "timestamp": "2025-03-10T20:38:04-04:00",
          "tree_id": "6bf0dbcd5ce06cccd1e09d6ea2eae3d4bda603f8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9ac518b4ca154a37ae625bc8d53df2982ce18d61"
        },
        "date": 1741654229937,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17921.010966000038,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15937.286141999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18595.513608000034,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16192.323325 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3973.904588000096,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3008.1585580000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54983.987881,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54983987000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11083.933449,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11083936000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1590742660,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1590742660 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 220038778,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 220038778 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
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
          "id": "662324489ab708a86396c27640a523ad6be721bb",
          "message": "chore: cleanup eth artifacts + misc aztec.js reorg (#12563)\n\nAttempt to remove as many L1 contract ABIs from `aztec.js` as possible,\nsince they're now the biggest individual contributors to bundle sizes.\n\nSome utilities have been removed from it (`deployL1Contracts` now live\nin `@aztec/ethereum` since doesn't really make sense for externals to\nuse it) and an `@aztec/aztec.js/testing` export has been created for\nthings like cheatcodes, so they're no longer in the main export.\n\nAlso the api folder has been cleaned up, so we can transition to\ngranular exports ASAP. For the time being the big export is kept and\nused in the playground to track overall bundle size (that has gone down\nfrom 1.9MB to 1.53). This cleanup paves the way for more API\nimprovements that are coming soon for wallets.",
          "timestamp": "2025-03-11T09:48:36Z",
          "tree_id": "1a50347f08a0afa22df24d74576cab40975d0b0b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/662324489ab708a86396c27640a523ad6be721bb"
        },
        "date": 1741688946518,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18405.045939000047,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16257.740239 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18868.697026000063,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16509.997894 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3915.8328079997773,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3049.671138 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55426.512031,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55426510000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9426.589259999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9426593000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1592868545,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1592868545 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 212532962,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 212532962 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
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
          "id": "de841877b0578c1c2258b89eb0abd17760697d80",
          "message": "chore(ci3): better memsuspend_limit comment (#12622)",
          "timestamp": "2025-03-11T11:11:38Z",
          "tree_id": "41d212d7a612fe3a5cde4bef1aceb7d8405ffff9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/de841877b0578c1c2258b89eb0abd17760697d80"
        },
        "date": 1741693296333,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18063.829737000106,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15970.717756 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18741.010108000184,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16325.153846000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3743.247535000137,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 2992.450962 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54960.549794,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54960550000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10416.290549,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10416298000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1655709782,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1655709782 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 221060787,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 221060787 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
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
          "distinct": true,
          "id": "5a1dc4ce95be41ad400e7012536b45eb4cfb5f81",
          "message": "fix: update dead partial notes link (#12629)\n\nCo-authored-by: Bohdan Ohorodnii <35969035+varex83@users.noreply.github.com>",
          "timestamp": "2025-03-11T20:24:38+08:00",
          "tree_id": "90497c1331017155d4725ebe2994e0b1ca0ad426",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5a1dc4ce95be41ad400e7012536b45eb4cfb5f81"
        },
        "date": 1741696645858,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17946.565658000054,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15796.929267 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18606.562831999894,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16483.402588 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3776.6491290000204,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3017.4084780000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54713.888162,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54713888000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11621.606274,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11621613000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1598882563,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1598882563 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 220826232,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 220826232 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "cc6cdbb8d74c6fb136513c56b4fa098fe92fb447",
          "message": "feat: Sync from noir (#12624)\n\nAutomated pull of development from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nchore: bump external pinned commits\n(https://github.com/noir-lang/noir/pull/7640)\nchore: remove unnecessary trait bounds\n(https://github.com/noir-lang/noir/pull/7635)\nfeat: add optional oracle resolver url in `acvm_cli`\n(https://github.com/noir-lang/noir/pull/7630)\nchore: Rename `StructDefinition` to `TypeDefinition`\n(https://github.com/noir-lang/noir/pull/7614)\nfix: Error on infinitely recursive types\n(https://github.com/noir-lang/noir/pull/7579)\nfix: update error message to display 128 bits as valid bit size\n(https://github.com/noir-lang/noir/pull/7626)\nchore: update docs to reflect u128 type\n(https://github.com/noir-lang/noir/pull/7623)\nfeat: array concat method (https://github.com/noir-lang/noir/pull/7199)\nEND_COMMIT_OVERRIDE\n\n---------\n\nCo-authored-by: TomAFrench <tom@tomfren.ch>",
          "timestamp": "2025-03-11T13:59:25Z",
          "tree_id": "38d1014c7876ede832743bd7b21977e4a942cf9c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cc6cdbb8d74c6fb136513c56b4fa098fe92fb447"
        },
        "date": 1741703346737,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18078.50741099992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15980.113184 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19004.453043000012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16439.543268 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3899.074222999843,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3073.604873 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55085.769491,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55085770000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10260.969568,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10260974000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1600887482,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1600887482 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 220626373,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 220626373 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "2ddfa76328115409b51b623b12eb2021c1d961f1",
          "message": "fix: Do not report epoch as complete until blocks have synced (#12638)\n\nFixes #12625",
          "timestamp": "2025-03-11T12:26:53-03:00",
          "tree_id": "7762cf3fae893f00bf268543d5ea0ee4d53b68ed",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2ddfa76328115409b51b623b12eb2021c1d961f1"
        },
        "date": 1741708993718,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18194.092604999925,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15913.860509 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18797.347358000025,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16376.03703 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3965.2910720001273,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3097.232817 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55566.11678599999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55566115000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10683.01621,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10683019000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1605221696,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1605221696 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 225453191,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 225453191 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "cb5d35ff23e8ea2bd3eace193b8f36ffa9d10c44",
          "message": "chore(master): release 0.79.0 (#12578)\n\n:robot: I have created a new Aztec Packages release\n---\n\n\n##\n[0.79.0](https://github.com/AztecProtocol/aztec-packages/compare/v0.78.1...v0.79.0)\n(2025-03-11)\n\n\n### ⚠ BREAKING CHANGES\n\n* aggregate data for batch calls\n([#12562](https://github.com/AztecProtocol/aztec-packages/issues/12562))\n\n### Features\n\n* add extra attributes to target_info\n([#12583](https://github.com/AztecProtocol/aztec-packages/issues/12583))\n([c296422](https://github.com/AztecProtocol/aztec-packages/commit/c296422e43f47fa9838045bc4faf933893046028))\n* add optional oracle resolver url in `acvm_cli`\n(https://github.com/noir-lang/noir/pull/7630)\n([cc6cdbb](https://github.com/AztecProtocol/aztec-packages/commit/cc6cdbb8d74c6fb136513c56b4fa098fe92fb447))\n* allow to pay via sponsored fpc from cli\n([#12598](https://github.com/AztecProtocol/aztec-packages/issues/12598))\n([877de5c](https://github.com/AztecProtocol/aztec-packages/commit/877de5c4e3fcfdad915f2fbb065611d5b54c93b5))\n* array concat method (https://github.com/noir-lang/noir/pull/7199)\n([cc6cdbb](https://github.com/AztecProtocol/aztec-packages/commit/cc6cdbb8d74c6fb136513c56b4fa098fe92fb447))\n* **avm:** ToRadix gadget\n([#12528](https://github.com/AztecProtocol/aztec-packages/issues/12528))\n([02a7171](https://github.com/AztecProtocol/aztec-packages/commit/02a7171d6d433d522c6819c2fe3f18822da43528))\n* aztec-up -v flag\n([#12590](https://github.com/AztecProtocol/aztec-packages/issues/12590))\n([6a41565](https://github.com/AztecProtocol/aztec-packages/commit/6a4156551cdd404dcefb9186aea0cdab47cef484))\n* **bb:** consider polynomial end_index when constructing partially\nevaluated multivariates\n([#12530](https://github.com/AztecProtocol/aztec-packages/issues/12530))\n([abd22cd](https://github.com/AztecProtocol/aztec-packages/commit/abd22cd21ce7201583f897c70591503a77db519a))\n* **config:** add fallbacks\n([#12593](https://github.com/AztecProtocol/aztec-packages/issues/12593))\n([f2f9ef3](https://github.com/AztecProtocol/aztec-packages/commit/f2f9ef3d82be0dc583f8acdc9a4b6c7441e8b014))\n* **p2p:** add trusted peers mechanics\n([#12447](https://github.com/AztecProtocol/aztec-packages/issues/12447))\n([d67f7e8](https://github.com/AztecProtocol/aztec-packages/commit/d67f7e809b34987392f282af64afe23e1fdf7736))\n* **p2p:** peer manager peer count metrics\n([#12575](https://github.com/AztecProtocol/aztec-packages/issues/12575))\n([b4891c1](https://github.com/AztecProtocol/aztec-packages/commit/b4891c14a2e49a8e475c6839840561a074c511cc))\n* provision alerts\n([#12561](https://github.com/AztecProtocol/aztec-packages/issues/12561))\n([2ea1767](https://github.com/AztecProtocol/aztec-packages/commit/2ea17670b5e7f7cc047a49313bd99032e39323de))\n* Resolve callstacks in protocol circuit errors on wasm\n([#12573](https://github.com/AztecProtocol/aztec-packages/issues/12573))\n([657299b](https://github.com/AztecProtocol/aztec-packages/commit/657299bfa0addf1279051d55a47289574536986a))\n\n\n### Bug Fixes\n\n* aggregate data for batch calls\n([#12562](https://github.com/AztecProtocol/aztec-packages/issues/12562))\n([bd0b3b6](https://github.com/AztecProtocol/aztec-packages/commit/bd0b3b69c57e9ed225b3a8b8e5dfba65edb31977))\n* broken kind transfer test\n([#12611](https://github.com/AztecProtocol/aztec-packages/issues/12611))\n([6e91934](https://github.com/AztecProtocol/aztec-packages/commit/6e919344d7e48695d07e154ce63cefae8cb7a6aa))\n* Cl/release fixes 2\n([#12595](https://github.com/AztecProtocol/aztec-packages/issues/12595))\n([fc597f4](https://github.com/AztecProtocol/aztec-packages/commit/fc597f4a6462902a345e6e879bf809634c0b83ed))\n* Cl/release noir refs\n([#12597](https://github.com/AztecProtocol/aztec-packages/issues/12597))\n([fdcfcaf](https://github.com/AztecProtocol/aztec-packages/commit/fdcfcaf5553a39c1d8b0e09fff3f9951171487d8))\n* demote log\n([#12626](https://github.com/AztecProtocol/aztec-packages/issues/12626))\n([bec8953](https://github.com/AztecProtocol/aztec-packages/commit/bec8953704cdc43a6f56073082b2b678ce594046))\n* deploy method test\n([#12609](https://github.com/AztecProtocol/aztec-packages/issues/12609))\n([f2c06c2](https://github.com/AztecProtocol/aztec-packages/commit/f2c06c2ccab8b980defe72d82db1b631c6994f91))\n* Do not report epoch as complete until blocks have synced\n([#12638](https://github.com/AztecProtocol/aztec-packages/issues/12638))\n([2ddfa76](https://github.com/AztecProtocol/aztec-packages/commit/2ddfa76328115409b51b623b12eb2021c1d961f1)),\ncloses\n[#12625](https://github.com/AztecProtocol/aztec-packages/issues/12625)\n* Error on infinitely recursive types\n(https://github.com/noir-lang/noir/pull/7579)\n([cc6cdbb](https://github.com/AztecProtocol/aztec-packages/commit/cc6cdbb8d74c6fb136513c56b4fa098fe92fb447))\n* get L1 tx utils config from env\n([#12620](https://github.com/AztecProtocol/aztec-packages/issues/12620))\n([d930c01](https://github.com/AztecProtocol/aztec-packages/commit/d930c0152bf1eb401b996006d247897b004c5b8d))\n* Log overflow handling in reset\n([#12579](https://github.com/AztecProtocol/aztec-packages/issues/12579))\n([283b624](https://github.com/AztecProtocol/aztec-packages/commit/283b624d909574ca8cf872448e61dbd748bb94d6))\n* metrics update\n([#12571](https://github.com/AztecProtocol/aztec-packages/issues/12571))\n([80a5df2](https://github.com/AztecProtocol/aztec-packages/commit/80a5df2e4ddd33a1c970207f119c984d44d8e191))\n* **sandbox:** query release please manifest for version if in a docker\ncontainer\n([#12591](https://github.com/AztecProtocol/aztec-packages/issues/12591))\n([db8ebc6](https://github.com/AztecProtocol/aztec-packages/commit/db8ebc64b28cf038afef2fe220c3c26fa21c9ac5))\n* **spartan:** setup needs kubectl\n([#12580](https://github.com/AztecProtocol/aztec-packages/issues/12580))\n([753cb33](https://github.com/AztecProtocol/aztec-packages/commit/753cb336cc6503a21eed1ed4e3220d5656be8b96))\n* update dead partial notes link\n([#12629](https://github.com/AztecProtocol/aztec-packages/issues/12629))\n([5a1dc4c](https://github.com/AztecProtocol/aztec-packages/commit/5a1dc4ce95be41ad400e7012536b45eb4cfb5f81))\n* update error message to display 128 bits as valid bit size\n(https://github.com/noir-lang/noir/pull/7626)\n([cc6cdbb](https://github.com/AztecProtocol/aztec-packages/commit/cc6cdbb8d74c6fb136513c56b4fa098fe92fb447))\n* update fallback transport\n([#12470](https://github.com/AztecProtocol/aztec-packages/issues/12470))\n([88f0711](https://github.com/AztecProtocol/aztec-packages/commit/88f07119f17808728deeff29f5624a9ac3af3770))\n\n\n### Miscellaneous\n\n* bump external pinned commits\n(https://github.com/noir-lang/noir/pull/7640)\n([cc6cdbb](https://github.com/AztecProtocol/aztec-packages/commit/cc6cdbb8d74c6fb136513c56b4fa098fe92fb447))\n* **ci3:** add helper for uncached test introspection\n([#12618](https://github.com/AztecProtocol/aztec-packages/issues/12618))\n([9ac518b](https://github.com/AztecProtocol/aztec-packages/commit/9ac518b4ca154a37ae625bc8d53df2982ce18d61))\n* **ci3:** better memsuspend_limit comment\n([#12622](https://github.com/AztecProtocol/aztec-packages/issues/12622))\n([de84187](https://github.com/AztecProtocol/aztec-packages/commit/de841877b0578c1c2258b89eb0abd17760697d80))\n* clean up upgrade test and other small things\n([#12558](https://github.com/AztecProtocol/aztec-packages/issues/12558))\n([c28abe1](https://github.com/AztecProtocol/aztec-packages/commit/c28abe173a89a560e06b21616fdeba859c2e5c7e))\n* cleanup eth artifacts + misc aztec.js reorg\n([#12563](https://github.com/AztecProtocol/aztec-packages/issues/12563))\n([6623244](https://github.com/AztecProtocol/aztec-packages/commit/662324489ab708a86396c27640a523ad6be721bb))\n* **docs:** Updated accounts page\n([#12019](https://github.com/AztecProtocol/aztec-packages/issues/12019))\n([d45dac9](https://github.com/AztecProtocol/aztec-packages/commit/d45dac9b69c55cdaaffb648350fbdf09972ba9d4))\n* Fix mac build\n([#12610](https://github.com/AztecProtocol/aztec-packages/issues/12610))\n([adceed6](https://github.com/AztecProtocol/aztec-packages/commit/adceed689cd8e47e2fa35bfd8aeb931d6bdc0ff7))\n* gemini soundness regression test\n([#12570](https://github.com/AztecProtocol/aztec-packages/issues/12570))\n([c654106](https://github.com/AztecProtocol/aztec-packages/commit/c654106241b7cc733d1e2e194d6abc812d8a91ad))\n* more sane e2e_prover/full timeout\n([#12619](https://github.com/AztecProtocol/aztec-packages/issues/12619))\n([add9d35](https://github.com/AztecProtocol/aztec-packages/commit/add9d35333e59d4fce2042bc5f28abdbe0d330b0))\n* reactivate acir_test for `regression_5045`\n([#12548](https://github.com/AztecProtocol/aztec-packages/issues/12548))\n([c89f89c](https://github.com/AztecProtocol/aztec-packages/commit/c89f89c7b8db2ebbcaa1a2cf77e5b105e507d5e2))\n* remove unnecessary trait bounds\n(https://github.com/noir-lang/noir/pull/7635)\n([cc6cdbb](https://github.com/AztecProtocol/aztec-packages/commit/cc6cdbb8d74c6fb136513c56b4fa098fe92fb447))\n* Rename `StructDefinition` to `TypeDefinition`\n(https://github.com/noir-lang/noir/pull/7614)\n([cc6cdbb](https://github.com/AztecProtocol/aztec-packages/commit/cc6cdbb8d74c6fb136513c56b4fa098fe92fb447))\n* replace relative paths to noir-protocol-circuits\n([4f7f5c3](https://github.com/AztecProtocol/aztec-packages/commit/4f7f5c3c42ac68fd2e7ea057679514a5f7260d8e))\n* replace relative paths to noir-protocol-circuits\n([0f68d11](https://github.com/AztecProtocol/aztec-packages/commit/0f68d1187309b4a8bdd0fc91213b32e82f1c91ac))\n* replace relative paths to noir-protocol-circuits\n([8f593ce](https://github.com/AztecProtocol/aztec-packages/commit/8f593ceace60289005a3896d677495670a1e3c43))\n* replace relative paths to noir-protocol-circuits\n([251ae38](https://github.com/AztecProtocol/aztec-packages/commit/251ae38262a381bd2c12a2abf69554855924885c))\n* rollup library cleanup\n([#12621](https://github.com/AztecProtocol/aztec-packages/issues/12621))\n([361fc59](https://github.com/AztecProtocol/aztec-packages/commit/361fc596b75a22671492d143f3e60dcafca4586f))\n* **sandbox:** drop cheat-codes log level\n([#12586](https://github.com/AztecProtocol/aztec-packages/issues/12586))\n([24f04c7](https://github.com/AztecProtocol/aztec-packages/commit/24f04c7092e2adaf2c4e701b42534d045dd9b62f))\n* **sandbox:** expose anvil port\n([#12599](https://github.com/AztecProtocol/aztec-packages/issues/12599))\n([955f1b0](https://github.com/AztecProtocol/aztec-packages/commit/955f1b0176057af46479e8146f22c052651c16c8))\n* **testnet:** updating script for ignition, change naming\n([#12566](https://github.com/AztecProtocol/aztec-packages/issues/12566))\n([2d7b69d](https://github.com/AztecProtocol/aztec-packages/commit/2d7b69d1227b9cc6b6aac69db0323c5d8ffd4d82))\n* turn on masking in eccvm\n([#12467](https://github.com/AztecProtocol/aztec-packages/issues/12467))\n([aacb91a](https://github.com/AztecProtocol/aztec-packages/commit/aacb91a49a7099c93b5953c210c151fe70dad433))\n* Update Bb line counting script\n([#12350](https://github.com/AztecProtocol/aztec-packages/issues/12350))\n([7a41843](https://github.com/AztecProtocol/aztec-packages/commit/7a4184390904708fd868485574e7521881341681))\n* update docs to reflect u128 type\n(https://github.com/noir-lang/noir/pull/7623)\n([cc6cdbb](https://github.com/AztecProtocol/aztec-packages/commit/cc6cdbb8d74c6fb136513c56b4fa098fe92fb447))\n* Validate blobs posted to sink belong to our L2\n([#12587](https://github.com/AztecProtocol/aztec-packages/issues/12587))\n([9578f1e](https://github.com/AztecProtocol/aztec-packages/commit/9578f1ef2122fa31fa35385d52219736b7809c7b)),\ncloses\n[#12497](https://github.com/AztecProtocol/aztec-packages/issues/12497)\n\n\n### Documentation\n\n* update cli-wallet commands in profiler doc\n([#12568](https://github.com/AztecProtocol/aztec-packages/issues/12568))\n([239a4fb](https://github.com/AztecProtocol/aztec-packages/commit/239a4fbb285329c120b2e588eed0c8ab58395066))\n\n---\nThis PR was generated with [Release\nPlease](https://github.com/googleapis/release-please). See\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2025-03-12T01:07:11+09:00",
          "tree_id": "cc603aeddc3b90574e231518fa2d7ddd20ec354d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cb5d35ff23e8ea2bd3eace193b8f36ffa9d10c44"
        },
        "date": 1741711088923,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17988.41900599996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15925.944765 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18697.342425999977,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16290.52395 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3927.0064190000085,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 2971.3568890000006 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54927.046147,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54927046000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10966.964664000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10966971000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1642255620,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1642255620 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 225121863,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 225121863 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
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
          "id": "93a6f4e6aba7b95d1fa95524033b89fe1e9b6e00",
          "message": "fix: fix yarn-project typos in release (#12652)",
          "timestamp": "2025-03-11T14:28:50-04:00",
          "tree_id": "d66db42e04f15d854e16a3c5dcc0e7422933f3c9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/93a6f4e6aba7b95d1fa95524033b89fe1e9b6e00"
        },
        "date": 1741720218935,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18234.744245,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16122.091491000003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18767.236511999727,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16340.697789 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3842.5230210000336,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3057.3749860000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55140.128686,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55140130000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10112.341341000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10112350000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1595853552,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1595853552 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 215662095,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 215662095 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "27168983deb9346aacc68b43938a86a442aa01e4",
          "message": "feat!: disable PXE concurrency (#12637)\n\nDebugging https://github.com/AztecProtocol/aztec-packages/pull/12391 led\nme to discover that we cannot have concurrent simulations due to\ncontracts now being allowed to read and write to PXE's stores at\narbitrary moments. E.g.\nhttps://github.com/AztecProtocol/aztec-packages/pull/12391 was failing\nCI due to multiple concurrent simulations deleting the same pending\npartial note from a capsule array.\n\nThis PR disables that behavior by putting the problematic tasks in a\nserial queue. Multiple tests still call PXE expecting concurrency\n(typically via usage of `await Promise.all`), but I thought it made more\nsense to disable the behavior this way and issue a warning (to unblock\nhttps://github.com/AztecProtocol/aztec-packages/pull/12391) and then\nworry about removing attempts to achieve concurrent behavior.\n\nI considered putting _all_ PXE functions in the serial queue, but\nrefrained from doing so to avoid introducing a larger than strictly\nneeded change. We may want to do this automatically via e.g.\nmonkey-patching to avoid accidentally forgetting a case.",
          "timestamp": "2025-03-11T18:48:04Z",
          "tree_id": "bdfa72012a899605d0dfcac37aa822cd35209152",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/27168983deb9346aacc68b43938a86a442aa01e4"
        },
        "date": 1741720942728,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18347.307196999966,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16162.820423 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18628.98519700002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16336.402362999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3872.9640219999055,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3109.9187680000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56066.345175999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56066345000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10496.748318,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10496754000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1611100843,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1611100843 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 222444889,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 222444889 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "4f815ea3a25bf157d49afc9c3948341fbda89f34",
          "message": "chore: downgrade undici so its engine spec is compatible (#12659)\n\nDowngrade undici so its node engine specification is compatible with\nNode 18 (LTS).\n\nRef https://undici.nodejs.org/#/?id=long-term-support\n\nFix #12645",
          "timestamp": "2025-03-11T20:24:07Z",
          "tree_id": "79620ab40c8651ec8fcce9a31b98ba544f68b439",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4f815ea3a25bf157d49afc9c3948341fbda89f34"
        },
        "date": 1741726713040,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18415.39371199997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15950.224271000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19090.97223499998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16414.835265 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3883.3806010002263,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3058.14109 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55985.635084,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55985635000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10435.586287,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10435595000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1630960164,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1630960164 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 230606822,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 230606822 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "79579f3c4fda4e3654d2b04ba4ea316c5b5f1dee",
          "message": "fix: Load config from env on archiver start (#12662)\n\nRunning `aztec start --archiver` without starting a node was not loading\nconfig from environment variables, only from CLI.",
          "timestamp": "2025-03-11T18:51:18-03:00",
          "tree_id": "4ddfd66bbe0e5dcdcba862d2114903fef7f81aad",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/79579f3c4fda4e3654d2b04ba4ea316c5b5f1dee"
        },
        "date": 1741731939955,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18329.891664000115,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16166.555004 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18769.701565000105,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16316.619132 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3866.6648560001704,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3122.5680890000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55221.656972,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55221655000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9945.993659000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9945996000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1600233438,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1600233438 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 221793317,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 221793317 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "mvezenov@gmail.com",
            "name": "Maxim Vezenov",
            "username": "vezenovm"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "8ec910b794ba3afa28517a7a58abe59bcf9560d7",
          "message": "chore: Remove roots arg on __compute_fracs in blob lib (#12663)\n\nSome cleanup missed in\nhttps://github.com/AztecProtocol/aztec-packages/pull/12418",
          "timestamp": "2025-03-11T22:51:53Z",
          "tree_id": "8645695905f962042d497dae5ac33bccb23df495",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8ec910b794ba3afa28517a7a58abe59bcf9560d7"
        },
        "date": 1741735565605,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18231.52282000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16024.868468999997 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18740.09194799987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16323.040796999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3883.198520000178,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3171.807745 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55152.739046,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55152740000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11198.90372,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11198907000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1633341113,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1633341113 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 221300736,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 221300736 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "80cd840a188ae14a313e15e46f642a05bbccfbb4",
          "message": "chore: aztec start should use pxe proving by default (#12676)\n\nResolves #12677\n\nCo-authored-by: sklppy88 <esau@aztecprotocol.com>",
          "timestamp": "2025-03-13T01:03:30+09:00",
          "tree_id": "066e51c49445ed16e0004038cb00339bf5e44d16",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/80cd840a188ae14a313e15e46f642a05bbccfbb4"
        },
        "date": 1741797633962,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18268.226581000134,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16148.071877999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18818.40012099997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16333.048755 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3908.0636460000733,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3109.444194 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55340.052856,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55340053000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9939.128168,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9939132000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1629512970,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1629512970 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 233776250,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 233776250 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2217.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "d12a5b8c2b99bc2161c07b5936e865ce6daf2d6d",
          "message": "chore(master): release 0.80.0 (#12654)\n\n:robot: I have created a new Aztec Packages release\n---\n\n\n##\n[0.80.0](https://github.com/AztecProtocol/aztec-packages/compare/v0.79.0...v0.80.0)\n(2025-03-12)\n\n\n### ⚠ BREAKING CHANGES\n\n* disable PXE concurrency\n([#12637](https://github.com/AztecProtocol/aztec-packages/issues/12637))\n\n### Features\n\n* add inspect command to bootstrap\n([#12641](https://github.com/AztecProtocol/aztec-packages/issues/12641))\n([2f0c527](https://github.com/AztecProtocol/aztec-packages/commit/2f0c5273571d4c8d28d0fff1dbe1cbdb527ba708))\n* disable PXE concurrency\n([#12637](https://github.com/AztecProtocol/aztec-packages/issues/12637))\n([2716898](https://github.com/AztecProtocol/aztec-packages/commit/27168983deb9346aacc68b43938a86a442aa01e4))\n* remove public bytecode from ts ContractArtifact\n([#12653](https://github.com/AztecProtocol/aztec-packages/issues/12653))\n([6345158](https://github.com/AztecProtocol/aztec-packages/commit/6345158022a55ea1e0ccdd874d12bbcb39d3c639))\n\n\n### Bug Fixes\n\n* **cli:** fix tag resolution for `aztec update --contract`\n([#12657](https://github.com/AztecProtocol/aztec-packages/issues/12657))\n([b58c123](https://github.com/AztecProtocol/aztec-packages/commit/b58c123972a136f4df904bbd57bde1115a6f9171))\n* **docs:** Fix link to source code after code snippets\n([#12658](https://github.com/AztecProtocol/aztec-packages/issues/12658))\n([8bc5daf](https://github.com/AztecProtocol/aztec-packages/commit/8bc5daf4471d85b6d970bb3d25defbe8c5dcb0da))\n* fix yarn-project typos in release\n([#12652](https://github.com/AztecProtocol/aztec-packages/issues/12652))\n([93a6f4e](https://github.com/AztecProtocol/aztec-packages/commit/93a6f4e6aba7b95d1fa95524033b89fe1e9b6e00))\n* handling undefined block number in sync data provider txe\n([#12605](https://github.com/AztecProtocol/aztec-packages/issues/12605))\n([b764a9a](https://github.com/AztecProtocol/aztec-packages/commit/b764a9a48a19c4803671876f9df8b7af53fe3e49))\n* Inject blob sink client config to archiver start\n([#12675](https://github.com/AztecProtocol/aztec-packages/issues/12675))\n([e2e857b](https://github.com/AztecProtocol/aztec-packages/commit/e2e857b5c12e220cb293dd7a681aaa7c3571fb97))\n* Load config from env on archiver start\n([#12662](https://github.com/AztecProtocol/aztec-packages/issues/12662))\n([79579f3](https://github.com/AztecProtocol/aztec-packages/commit/79579f3c4fda4e3654d2b04ba4ea316c5b5f1dee))\n\n\n### Miscellaneous\n\n* aztec start should use pxe proving by default\n([#12676](https://github.com/AztecProtocol/aztec-packages/issues/12676))\n([80cd840](https://github.com/AztecProtocol/aztec-packages/commit/80cd840a188ae14a313e15e46f642a05bbccfbb4)),\ncloses\n[#12677](https://github.com/AztecProtocol/aztec-packages/issues/12677)\n* downgrade undici so its engine spec is compatible\n([#12659](https://github.com/AztecProtocol/aztec-packages/issues/12659))\n([4f815ea](https://github.com/AztecProtocol/aztec-packages/commit/4f815ea3a25bf157d49afc9c3948341fbda89f34)),\ncloses\n[#12645](https://github.com/AztecProtocol/aztec-packages/issues/12645)\n* fix warning in aztec-nr\n([#12647](https://github.com/AztecProtocol/aztec-packages/issues/12647))\n([3831bab](https://github.com/AztecProtocol/aztec-packages/commit/3831bab7c40acd9aa2c0714bb61a08d6d613175e))\n* Merge is part of verification queue\n([#12612](https://github.com/AztecProtocol/aztec-packages/issues/12612))\n([e324582](https://github.com/AztecProtocol/aztec-packages/commit/e3245823b0abdb351dddce2c9f821f28d691cd61))\n* Remove roots arg on __compute_fracs in blob lib\n([#12663](https://github.com/AztecProtocol/aztec-packages/issues/12663))\n([8ec910b](https://github.com/AztecProtocol/aztec-packages/commit/8ec910b794ba3afa28517a7a58abe59bcf9560d7))\n* replace relative paths to noir-protocol-circuits\n([f684528](https://github.com/AztecProtocol/aztec-packages/commit/f684528b268a958388f24c71b9e2b01013e21eb5))\n* test cli upgrade\n([#12506](https://github.com/AztecProtocol/aztec-packages/issues/12506))\n([fc728f3](https://github.com/AztecProtocol/aztec-packages/commit/fc728f379c6c670664b7db6445d0a9b42294a685))\n\n\n### Documentation\n\n* **feat:** Aztec js intro page\n([#11804](https://github.com/AztecProtocol/aztec-packages/issues/11804))\n([12d8f3f](https://github.com/AztecProtocol/aztec-packages/commit/12d8f3ffd4f7319e21d79002389cf19a8ebfc4bc))\n\n---\nThis PR was generated with [Release\nPlease](https://github.com/googleapis/release-please). See\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2025-03-12T16:25:48Z",
          "tree_id": "340f893425aec17003c619315293ffd8f983b093",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d12a5b8c2b99bc2161c07b5936e865ce6daf2d6d"
        },
        "date": 1741797736266,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18189.49798899996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15865.457234000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18654.62352099996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16232.521008 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3810.580996999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3230.1667319999992 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54142.440101,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54142440000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9854.99774,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9855000000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1633336930,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1633336930 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 216946952,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 216946952 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2217.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "de11e938e6830afb4228104dc659a5a9c655922e",
          "message": "chore: Sumcheck optimizations (#12630)\n\nCompared to master for 16 cores, sumcheck of bulk test AVM V2 takes 2.5%\nless time and ca. 5% less memory.\n\nmaster: 16.22 seconds\nthis pr:  15.80 seconds\n\nAverage of 5 measurements on each branch.\nMemory peak in proving: No change for bulk test, it remains at 4.32 GB\nmaximum resident size\nMemory impact during sumcheck: reduce from 2831 MB to 2677 MB (measured\nwith Tracy on bulk test v2)\n\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1120.",
          "timestamp": "2025-03-12T17:42:05+01:00",
          "tree_id": "538b925e1fafcabea9f98c2c7b7cdccf1fc92951",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/de11e938e6830afb4228104dc659a5a9c655922e"
        },
        "date": 1741799922337,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18107.63354599999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16046.646261 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18699.454239000035,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16222.502703 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3888.038520000009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3097.689061 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55537.646,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55537647000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9943.196952999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9943201000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1608749629,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1608749629 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 212844317,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 212844317 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2297.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "527187afaf6b58c8c2d94f52a81d8c0f7e2779d0",
          "message": "chore: Fix path in L1 contract (#12686)\n\nEtherscan complained about the double-slash when trying to verify.",
          "timestamp": "2025-03-12T16:53:11Z",
          "tree_id": "88104282796ff60a6a4db27ee8f3ec54db5b6e00",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/527187afaf6b58c8c2d94f52a81d8c0f7e2779d0"
        },
        "date": 1741800575445,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18251.386124000193,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16188.505842999997 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18786.824302000015,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16396.192714 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3927.137240999855,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3096.448697 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55347.806794000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55347807000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10764.521953000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10764526000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1622944313,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1622944313 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 228760200,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 228760200 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2297.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "47e5bc0bff4d41051a75b5a41e87423fa4637e2d",
          "message": "refactor: storing recipient address instead of recipient address point (#12684)",
          "timestamp": "2025-03-12T18:30:57+01:00",
          "tree_id": "36c7136a39ce76b03b084b1dac4506f6909abb26",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/47e5bc0bff4d41051a75b5a41e87423fa4637e2d"
        },
        "date": 1741803516867,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18178.116490999855,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15941.593843 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18965.704278999965,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16435.547475 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3955.1680090003174,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3069.705422 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55372.562074,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55372562000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10878.479430999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10878480000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1610632112,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1610632112 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 226186411,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 226186411 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2297.31",
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
          "distinct": true,
          "id": "15ca73253e479c6af8fd3e66d2fed81011192067",
          "message": "chore(p2p): simplify p2p config (#12589)",
          "timestamp": "2025-03-12T19:54:52Z",
          "tree_id": "b458b372a8be45ef8680a9cf3361f0bf2e53dae9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/15ca73253e479c6af8fd3e66d2fed81011192067"
        },
        "date": 1741811328876,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18113.257385999987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16098.152298000003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18745.200716,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16420.471768 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3911.391429999867,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3083.3895269999994 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54907.477246999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54907479000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11469.116412999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11469121000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1620281631,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1620281631 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 222393266,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 222393266 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2209.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "a225aacf4fbb1760a788efe69cbf1ddd09699984",
          "message": "fix: Listen on correct address (#12712)\n\nThe P2P needs to listen on the listen address.",
          "timestamp": "2025-03-13T11:53:42Z",
          "tree_id": "0146be230bb515831e1037dea12c523c19f1c305",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a225aacf4fbb1760a788efe69cbf1ddd09699984"
        },
        "date": 1741870154714,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18076.471907000043,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15892.721207 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18616.705553999964,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16130.475384000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3818.011874999911,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3079.320984000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54599.681152,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54599682000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10752.952208,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10752960000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1587948732,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1587948732 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 221716053,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 221716053 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2209.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "ad290061ee3b5ff094445c2f181c4567a60bd396",
          "message": "feat: restore system metrics (#12672)\n\nThis restores the disabled `system.*` metrics and aggregates the cpu\nmetric to avoid big jumps in cardinality",
          "timestamp": "2025-03-13T11:53:00Z",
          "tree_id": "3c29e602f7f723b361894c43b8c3b975282aef01",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ad290061ee3b5ff094445c2f181c4567a60bd396"
        },
        "date": 1741870164638,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18075.813453000137,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15940.172042000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18612.1978409999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16143.285574 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3746.290598000087,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3034.6969050000007 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54852.061035000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54852063000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11540.130744,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11540137000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1602768868,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1602768868 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 217708201,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 217708201 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2209.31",
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
          "id": "a8fefc8d7d84630b1cebc8a3c19af60fee6e0cbb",
          "message": "fix(docs): Remove @aztec/types from token bridge tutorial deps (#12700)\n\nThe @aztec/types dependency is no longer needed for the token bridge\ntutorial",
          "timestamp": "2025-03-13T15:36:20+04:00",
          "tree_id": "40b61b04ba5a282e3874e22ea0bacfb8ed53b0c0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a8fefc8d7d84630b1cebc8a3c19af60fee6e0cbb"
        },
        "date": 1741870242539,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18049.184637000053,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16029.003297000003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18624.094542999956,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16286.422487 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3814.443310999877,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3079.11707 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55010.767123,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55010769000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10310.045288,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10310056000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1608351186,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1608351186 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 211737889,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 211737889 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2209.31",
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
          "distinct": true,
          "id": "b599a1621c7e3acd0acee51b3116a2285c81e438",
          "message": "fix: Specify block number when fetching instances (alternative) (#12709)\n\nWe need to specify a block number when fetching contract instances since\nduring block building, we want to fetch what the instance will be for\nthe blocknumber being built, not the one currently synced.\nAlternative to\nhttps://github.com/AztecProtocol/aztec-packages/pull/12688 I think this\noption is worse conceptually altough it's less changes. `class\nWorldStateDB extends ContractsDataSourcePublicDB` is a block level cache\nso it makes sense that it receives the block it's caching for on\nconstruction. This PR requires passing block number on every fetch",
          "timestamp": "2025-03-13T13:14:49+01:00",
          "tree_id": "b8bad8c520a015b68048f6694c27a095625e3fc1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b599a1621c7e3acd0acee51b3116a2285c81e438"
        },
        "date": 1741870245576,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18397.949688999914,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16233.722686000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18750.953328999913,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16391.708968 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3893.058321000126,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3101.886931 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55307.331076999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55307329000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10443.683318,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10443688000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1602783969,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1602783969 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 212534740,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 212534740 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2209.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "b933222cb2d2ae7b4fd8258e20960f913074905f",
          "message": "fix: revert \"refactor: `CommitmentsDB` interface cleanup (#12695)\" (#12723)\n\nThis reverts commit 43f54da6d3f261cf8f577b1386b92f65b0b1e65f, from\nmerging #12695.",
          "timestamp": "2025-03-13T16:03:57Z",
          "tree_id": "0f657ba3870a8956a3ef52a007dc0b0fdb992f92",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b933222cb2d2ae7b4fd8258e20960f913074905f"
        },
        "date": 1741883853527,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18129.133349000083,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16064.721085000003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18627.005855000105,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16098.183690999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3855.6125560000964,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3085.209272 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54808.452619,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54808453000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10597.556953999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10597562000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1612265018,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1612265018 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 231102617,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 231102617 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2209.31",
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
          "id": "2c89970c2142bd6934e4dcf81f1a00c36d083f07",
          "message": "fix: make bb mac workaround kick off automatically (#12651)\n\nThis will streamline the release process until this is fully done with\ncross compiles",
          "timestamp": "2025-03-14T03:16:14+09:00",
          "tree_id": "b38c167ad3950486909724a442b6668d4323fea5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2c89970c2142bd6934e4dcf81f1a00c36d083f07"
        },
        "date": 1741891596465,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18025.996274999896,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15921.379896 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18612.458613999934,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16298.042681000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3796.088232999864,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3034.4858019999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54760.601221,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54760602000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10899.427848999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10899432000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1613359844,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1613359844 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 219125869,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 219125869 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2209.31",
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
          "id": "52575d82279e5bc8caca5922289aa2e8e157f4a3",
          "message": "fix: bench upload logic (#12800)",
          "timestamp": "2025-03-17T11:37:35-04:00",
          "tree_id": "f85f248ba089bfb563198b0616a75af2f242be15",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/52575d82279e5bc8caca5922289aa2e8e157f4a3"
        },
        "date": 1742227405065,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17872.0024050001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15772.682208999999 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 117748255211.3,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1601237449,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213375376,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18574.36891899988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16171.600753 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54385.582372000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54385582000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3782.039356000041,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 2993.9132879999997 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10159.238985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10159242000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
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
          "id": "100d31fa2b017617d8c4238c2e819f0ae653b074",
          "message": "chore: Update references to GH issues to reflect recent changes (#12722)\n\nAfter looking over all of the Barretenberg issues, and closing some, I\nhave gone through the monorepo to remove any stale references to these\nissues. In a small number of cases I opened a new, issue which was a\nrefinement of the previous issue, and in the case of slab allocation I\nleft the stale issues in since I thought it could be helpful if that\nissue is ever reopened.",
          "timestamp": "2025-03-17T12:43:04-04:00",
          "tree_id": "28295b0e830468823f3bd0560d9735c4e8e8a8aa",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/100d31fa2b017617d8c4238c2e819f0ae653b074"
        },
        "date": 1742232144967,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18190.259972999684,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15972.490602 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 117757453489.99998,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1658364393,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 231266845,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18815.73351499992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16326.429828999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55050.549125,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55050550000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3902.314273999764,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3071.8012270000004 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10043.984663,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10043992000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
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
          "id": "2fd47f674f487c1b8f3c4389abf2124e73d0da6a",
          "message": "fix: update join split test hash (#12798)\n\nUpdate the circuit hash in a join split test. This changes all the time\nbut the test is currently skipped on CI so whoever pushed the PR that\nchanged it wasn't alerted. May wind up deleting these altogether at some\npoint soon.",
          "timestamp": "2025-03-17T10:21:52-07:00",
          "tree_id": "0ad157348b4df3c91eecf9e662f58f43bf95a9c4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2fd47f674f487c1b8f3c4389abf2124e73d0da6a"
        },
        "date": 1742234387627,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18165.535497000063,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15997.693997999999 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 117765486863.39998,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1625114514,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 226682897,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18809.234265999978,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16498.861259 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55069.784941000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55069784000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3867.609295999955,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3113.705645 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10674.185683000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10674189000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
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
          "id": "392abc287812ccee2fc8be14132fda74d1e95672",
          "message": "fix: redo \"fix: make vk metadata actual witnesses\" (#12535)\n\nReverts AztecProtocol/aztec-packages#12534. This was reverted due to\nbreaking e2e-prover-full\n\nCo-authored-by: Lucas Xia <lucasxia01@gmail.com>",
          "timestamp": "2025-03-17T13:29:08-04:00",
          "tree_id": "c8b56e6e40987052267cbfb0153b9fd57ab78b23",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/392abc287812ccee2fc8be14132fda74d1e95672"
        },
        "date": 1742234783501,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18574.072044000102,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16226.711718 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 117735958245.4,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1617690716,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 218901781,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18900.791500999956,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16437.75797 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55143.730713,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55143731000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3842.8058100000726,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3117.095798 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10255.291738,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10255297000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2265.31",
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
          "id": "95a0ec174a7ad07c5584d6d2f9b8a775321a1f50",
          "message": "fix: cpp ivc bench (#12815)",
          "timestamp": "2025-03-17T17:09:25-04:00",
          "tree_id": "e4001bdc4a05daba47780670a9df9535d5d67e25",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/95a0ec174a7ad07c5584d6d2f9b8a775321a1f50"
        },
        "date": 1742250236941,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 38827,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 25561,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17936.281925000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15812.969825999999 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 117735720600.2,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1615088593,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 212688333,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18693.395686000033,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16325.580334000002 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54645.949759,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54645948000 ms\nthreads: 1"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11407,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14326,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 14916,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3801.58626299999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3032.9817489999996 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10368.054414999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10368058000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2265.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "189fc8388831f0d36b7c0d8de96fca9d1ce6f07a",
          "message": "Merge branch 'master' of github.com:aztecprotocol/aztec-packages",
          "timestamp": "2025-03-18T15:53:11Z",
          "tree_id": "9390dd7bc74e3b988b4d223ec2ea66c544feb74a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/189fc8388831f0d36b7c0d8de96fca9d1ce6f07a"
        },
        "date": 1742314357150,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39382,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26677,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18350.029480000103,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16016.392651999997 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 117856246462.2,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1602256987,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 224858140,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18693.264371999932,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16265.676263000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55235.565342999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55235566000 ms\nthreads: 1"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11891,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14768,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15552,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3918.1659020002826,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3156.307688 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11261.815299000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11261819000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2217.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "233ca3eb21fdd04ac676f37b21ef4d0b7c74932a",
          "message": "chore(avm): vm2 lazy bytecode loading (#12847)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this line.",
          "timestamp": "2025-03-18T17:05:48Z",
          "tree_id": "8d76e428c46cc3913396ecc13090f10fed566aa5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/233ca3eb21fdd04ac676f37b21ef4d0b7c74932a"
        },
        "date": 1742320083675,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39434,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26440,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18152.584247999584,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15985.96143 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 117831117316.90001,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1597585979,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213587133,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18710.20141500003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16279.589767000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55085.688323,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55085688000 ms\nthreads: 1"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11799,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14540,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 14990,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3932.0093040000756,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3136.8573890000002 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11349.533999000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11349538000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2217.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "04981e2a395e51cd07a398c173d55a3a3a53ae44",
          "message": "refactor(avm): vm2 recursive execution (#12842)\n\nAfter discussions with @IlyasRidhuan we think this is the most viable\npath to make things work for CALL and context management.",
          "timestamp": "2025-03-19T23:10:37+08:00",
          "tree_id": "363b64f68372aa2a122218855730d4bdbcc0fe17",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/04981e2a395e51cd07a398c173d55a3a3a53ae44"
        },
        "date": 1742398748550,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 34003,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 22356,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17115.814393999928,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15113.863798999999 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 117822023765.3,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1495092600,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 203417844,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 17996.02665499992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15474.759369000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 49957.784125,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 49957785000 ms\nthreads: 1"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 10755,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 13018,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 13339,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3362.6136400000632,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 2963.554606 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 8840.967408,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 8840968000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2217.31",
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