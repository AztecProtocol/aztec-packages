> [!WARNING]
> :warning: This is not an actively developed repository, it is a mirror. See <https://github.com/AztecProtocol/aztec-packages> :warning:

> [!WARNING]
> :warning: **<https://github.com/AztecProtocol/barretenberg> is a mirror-only repository, please only use <https://github.com/AztecProtocol/aztec-packages>. Do not use this for any purpose other than reference.** :warning:

# Barretenberg

Barretenberg (or `bb` for short) is an optimized elliptic curve library for the bn128 curve, and a PLONK SNARK prover.

- [Barretenberg](#barretenberg)
  - [Development](#development)
    - [Bootstrap](#bootstrap)
    - [Build Options and Instructions](#build-options-and-instructions)
      - [WASM build](#wasm-build)
      - [Fuzzing build](#fuzzing-build)
      - [Test coverage build](#test-coverage-build)
    - [Formatting](#formatting)
    - [Testing](#testing)
      - [Integration tests with Aztec in Monorepo](#integration-tests-with-aztec-in-monorepo)
        - [Integration tests with Aztec in Barretenberg Standalone Repo](#integration-tests-with-aztec-in-barretenberg-standalone-repo)
        - [Testing locally in docker](#testing-locally-in-docker)
    - [Docs Build](#docs-build)
    - [Benchmarks](#benchmarks)
      - [x86\_64](#x86_64)
      - [WASM](#wasm)
      - [How to run](#how-to-run)
    - [Debugging](#debugging)
      - [Debugging Verifification Failures](#debugging-verifification-failures)
      - [Improving LLDB Debugging](#improving-lldb-debugging)
      - [Using Tracy to Profile Memory/CPU/Gate Counts](#using-tracy-to-profile-memorycpugate-counts)
        - [Set Up and Script Usage](#set-up-and-script-usage)
        - [Using the GUI](#using-the-gui)
        - [Adding Zones](#adding-zones)
        - [Analyzing Fragmentation](#analyzing-fragmentation)
        - [Final Thoughts](#final-thoughts)

> [!CAUTION] > **This code is highly experimental, use at your own risk!**

## Development

The following packages are required for building from source:

- cmake >= 3.24
- Ninja (used by the presets as the default generator)
- clang >= 16 or gcc >= 10
- clang-format
- libstdc++ >= 12
- libomp (if multithreading is required. Multithreading can be disabled using the compiler flag `-DMULTITHREADING 0`)

To install these on Ubuntu, run:

```bash
sudo apt-get install cmake clang clang-format ninja-build libstdc++-12-dev
```

The default cmake version on 22.04 is 3.22.1, so it must be updated. You can get the latest version [here](https://cmake.org/download).

When running MacOS Sonoma 14.2.1 the following steps are necessary:

- update bash with `brew install bash`
- update [cmake](https://cmake.org/download)

It is recommended to use homebrew llvm on macOS to enable std::execution parallel algorithms. To do so:

- Install llvm with `brew install llvm`
- Add it to the path with `export PATH="/opt/homebrew/opt/llvm/bin:$PATH"` in your shell or profile file.

<details>
<summary><h3>Installing openMP (Linux)</h3></summary>

You can get openMP from package managers. Ex. on Ubuntu:

```bash
sudo apt-get install libomp-dev
```

Or you can install it from source:

```bash!
git clone -b release/10.x --depth 1 https://github.com/llvm/llvm-project.git \
  && cd llvm-project && mkdir build-openmp && cd build-openmp \
  && cmake ../openmp -DCMAKE_C_COMPILER=clang -DCMAKE_CXX_COMPILER=clang++ -DLIBOMP_ENABLE_SHARED=OFF \
  && cmake --build . --parallel \
  && cmake --build . --parallel --target install \
  && cd ../.. && rm -rf llvm-project
```

> [!Note]
> On a fresh Ubuntu Kinetic installation, installing OpenMP from source yields a `Could NOT find OpenMP_C (missing: OpenMP_omp_LIBRARY) (found version "5.0")` error when trying to build Barretenberg. Installing from apt worked fine.

</details>

### Bootstrap

The bootstrap script will build both the native and wasm versions of barretenberg:

```bash
cd cpp
./bootstrap.sh
```

### Build Options and Instructions

CMake can be passed various build options on its command line:

- `-DCMAKE_BUILD_TYPE=Debug | Release | RelWithAssert`: Build types.
- `-DDISABLE_ASM=ON | OFF`: Enable/disable x86 assembly.
- `-DDISABLE_ADX=ON | OFF`: Enable/disable ADX assembly instructions (for older cpu support).
- `-DMULTITHREADING=ON | OFF`: Enable/disable multithreading.
- `-DOMP_MULTITHREADING=ON | OFF`: Enable/disable multithreading that uses OpenMP.
- `-DTESTING=ON | OFF`: Enable/disable building of tests.
- `-DBENCHMARK=ON | OFF`: Enable/disable building of benchmarks.
- `-DFUZZING=ON | OFF`: Enable building various fuzzers.

Various presets are defined in CMakePresets.json for scenarios such as instrumentation, cross-compiling and targets such as WASM.

#### WASM build

To build:

```bash
cmake --preset wasm
cmake --build --preset wasm --target barretenberg.wasm
```

The resulting wasm binary will be at `./build-wasm/bin/barretenberg.wasm`.

To run the tests, you'll need to install `wasmtime`.

```
curl https://wasmtime.dev/install.sh -sSf | bash
```

Tests can be built and run like:

```bash
cmake --build --preset wasm --target ecc_tests
wasmtime --dir=.. ./bin/ecc_tests
```

To add gtest filter parameters in a wasm context:

```
wasmtime --dir=.. ./bin/ecc_tests run --gtest_filter=filtertext
```

#### Fuzzing build

For detailed instructions look in cpp/docs/Fuzzing.md

To build:

```bash
cmake --preset fuzzing
cmake --build --preset fuzzing
```

Fuzzing build turns off building tests and benchmarks, since they are incompatible with libfuzzer interface.

To turn on address sanitizer add `-DADDRESS_SANITIZER=ON`. Note that address sanitizer can be used to explore crashes.
Sometimes you might have to specify the address of llvm-symbolizer. You have to do it with `export ASAN_SYMBOLIZER_PATH=<PATH_TO_SYMBOLIZER>`.
For undefined behavior sanitizer `-DUNDEFINED_BEHAVIOUR_SANITIZER=ON`.
Note that the fuzzer can be orders of magnitude slower with ASan (2-3x slower) or UBSan on, so it is best to run a non-sanitized build first, minimize the testcase and then run it for a bit of time with sanitizers.

#### Test coverage build

To build:

```bash
cmake --preset coverage
cmake --build --preset coverage
```

Then run tests (on the mainframe always use taskset and nice to limit your influence on the server. Profiling instrumentation is very heavy):

```
taskset 0xffffff nice -n10 make test
```

And generate report:

```
make create_full_coverage_report
```

The report will land in the build directory in the all_test_coverage_report directory.

Alternatively you can build separate test binaries, e.g. honk_tests or numeric_tests and run **make test** just for them or even just for a single test. Then the report will just show coverage for those binaries.

### Formatting

Code is formatted using `clang-format` and the `./cpp/format.sh` script which is called via a git pre-commit hook.

> [!TIP]
> A default configuration for VS Code is provided by the file [`barretenberg.code-workspace`](barretenberg.code-workspace). These settings can be overridden by placing configuration files in `.vscode/`.
> If you've installed the C++ Vscode extension, configure it to format on save!

### Testing

Each module has its own tests. See `./cpp/scripts/bb-tests.sh` for an exhaustive list of test module names.

e.g. To build and run `ecc` tests:

```bash
# Replace the `default` preset with whichever preset you want to use
cmake --build --preset default --target ecc_tests
cd build
./bin/ecc_tests
```

A shorthand for the above is:

```bash
# Replace the `default` preset with whichever preset you want to use
cmake --build --preset default --target run_ecc_tests
```

Running the entire suite of tests using `ctest`:

```bash
cmake --build --preset default --target test
```

You can run specific tests, e.g.

```
./bin/ecc_tests --gtest_filter=scalar_multiplication.*
```

#### Integration tests with Aztec in Monorepo

CI will automatically run integration tests against Aztec. It is located in the `barretenberg` folder.

##### Integration tests with Aztec in Barretenberg Standalone Repo

When working on a PR, you may want to point this file to a different Aztec branch or commit, but then it should probably be pointed back to master before merging.

##### Testing locally in docker

A common issue that arises is that our CI system has a different compiler version e.g. namely for GCC. If you need to mimic the CI operating system locally you can use bootstrap_docker.sh or run dockerfiles directly. However, there is a more efficient workflow for iterative development:

```
cd barretenberg/cpp
./scripts/docker_interactive.sh
mv build build-native # your native build folders are mounted, but will not work! have to clear them
cmake --preset gcc ;  cmake --build build
```

This will allow you to rebuild as efficiently as if you were running native code, and not have to see a full compile cycle.

### Docs Build

If doxygen is installed on the system, you can use the **build_docs** target to build documentation, which can be configured in vscode CMake extension or using

```bash
cmake --build . --target build_docs
```

in the cpp/build directory. The documentation will be generated in cpp/docs/build folder. You can then run a python http server in the folder:

```bash
python3 -m http.server <port>
```

and tunnel the port through ssh.

### Benchmarks

Table represents time in ms to build circuit and proof for each test on n threads.
Ignores proving key construction.

#### x86_64

```
+--------------------------+------------+---------------+-----------+-----------+-----------+-----------+-----------+
| Test                     | Gate Count | Subgroup Size |         1 |         4 |        16 |        32 |        64 |
+--------------------------+------------+---------------+-----------+-----------+-----------+-----------+-----------+
| sha256                   | 38799      | 65536         |      5947 |      1653 |       729 |       476 |       388 |
| ecdsa_secp256k1          | 41049      | 65536         |      6005 |      2060 |       963 |       693 |       583 |
| ecdsa_secp256r1          | 67331      | 131072        |     12186 |      3807 |      1612 |      1351 |      1137 |
| schnorr                  | 33740      | 65536         |      5817 |      1696 |       688 |       532 |       432 |
| double_verify_proof      | 505513     | 524288        |     47841 |     15824 |      7970 |      6784 |      6082 |
+--------------------------+------------+---------------+-----------+-----------+-----------+-----------+-----------+
```

#### WASM

```
+--------------------------+------------+---------------+-----------+-----------+-----------+-----------+-----------+
| Test                     | Gate Count | Subgroup Size |         1 |         4 |        16 |        32 |        64 |
+--------------------------+------------+---------------+-----------+-----------+-----------+-----------+-----------+
| sha256                   | 38799      | 65536         |     18764 |      5116 |      1854 |      1524 |      1635 |
| ecdsa_secp256k1          | 41049      | 65536         |     19129 |      5595 |      2255 |      2097 |      2166 |
| ecdsa_secp256r1          | 67331      | 131072        |     38815 |     11257 |      4744 |      3633 |      3702 |
| schnorr                  | 33740      | 65536         |     18649 |      5244 |      2019 |      1498 |      1702 |
| double_verify_proof      | 505513     | 524288        |    149652 |     45702 |     20811 |     16979 |     15679 |
+--------------------------+------------+---------------+-----------+-----------+-----------+-----------+-----------+
```

#### How to run

Some modules have benchmarks. The build targets are named `<module_name>_bench`. To build and run, for example `ecc` benchmarks.

```bash
# Replace the `default` preset with whichever preset you want to use
cmake --build --preset default --target ecc_bench
cd build
./bin/ecc_bench
```

A shorthand for the above is:

```bash
# Replace the `default` preset with whichever preset you want to use
cmake --build --preset default --target run_ecc_bench
```

### Debugging

#### Debugging Verifification Failures

The CircuitChecker::check_circuit function is used to get the gate index and block information about a failing circuit constraint.
If you are in a scenario where you have a failing call to check_circuit and wish to get more information out of it than just the gate index, you can use this feature to get a stack trace, see example below.

Usage instructions:

- On ubuntu (or our mainframe accounts) use `sudo apt-get install libdw-dev` to support trace printing
- Use `cmake --preset clang16-dbg-fast-circuit-check-traces` and `cmake --build --preset clang16-dbg-fast-circuit-check-traces` to enable the backward-cpp dependency through the CHECK_CIRCUIT_STACKTRACES CMake variable.
- Run any case where you have a failing check_circuit call, you will now have a stack trace illuminating where this constraint was added in code.

Caveats:

- This works best for code that is not overly generic, i.e. where just the sequence of function calls carries a lot of information. It is possible to tag extra data along with the stack trace, this can be done as a followup, please leave feedback if desired.
- There are certain functions like `assert_equals` that can cause gates that occur _before_ them to fail. If this would be useful to automatically report, please leave feedback.

Example:

```
[ RUN      ] standard_circuit_constructor.test_check_circuit_broken
Stack trace (most recent call last):
#4    Source "_deps/gtest-src/googletest/src/gtest.cc", line 2845, in Run
       2842:   if (!Test::HasFatalFailure() && !Test::IsSkipped()) {
       2843:     // This doesn't throw as all user code that can throw are wrapped into
       2844:     // exception handling code.
      >2845:     test->Run();
       2846:   }
       2847:
       2848:   if (test != nullptr) {
#3    Source "_deps/gtest-src/googletest/src/gtest.cc", line 2696, in Run
       2693:   // GTEST_SKIP().
       2694:   if (!HasFatalFailure() && !IsSkipped()) {
       2695:     impl->os_stack_trace_getter()->UponLeavingGTest();
      >2696:     internal::HandleExceptionsInMethodIfSupported(this, &Test::TestBody,
       2697:                                                   "the test body");
       2698:   }
#2  | Source "_deps/gtest-src/googletest/src/gtest.cc", line 2657, in HandleSehExceptionsInMethodIfSupported<testing::Test, void>
    |  2655: #if GTEST_HAS_EXCEPTIONS
    |  2656:     try {
    | >2657:       return HandleSehExceptionsInMethodIfSupported(object, method, location);
    |  2658:     } catch (const AssertionException&) {  // NOLINT
    |  2659:       // This failure was reported already.
      Source "_deps/gtest-src/googletest/src/gtest.cc", line 2621, in HandleExceptionsInMethodIfSupported<testing::Test, void>
       2618:   }
       2619: #else
       2620:   (void)location;
      >2621:   return (object->*method)();
       2622: #endif  // GTEST_HAS_SEH
       2623: }
#1    Source "/mnt/user-data/adam/aztec-packages/barretenberg/cpp/src/barretenberg/circuit_checker/standard_circuit_builder.test.cpp", line 464, in TestBody
        461:     uint32_t d_idx = circuit_constructor.add_variable(d);
        462:     circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
        463:
      > 464:     circuit_constructor.create_add_gate({ d_idx, c_idx, a_idx, fr::one(), fr::neg_one(), fr::neg_one(), fr::zero() });
        465:
        466:     bool result = CircuitChecker::check(circuit_constructor);
        467:     EXPECT_EQ(result, false);
#0    Source "/mnt/user-data/adam/aztec-packages/barretenberg/cpp/src/barretenberg/stdlib_circuit_builders/standard_circuit_builder.cpp", line 22, in create_add_gate
         19: {
         20:     this->assert_valid_variables({ in.a, in.b, in.c });
         21:
      >  22:     blocks.arithmetic.populate_wires(in.a, in.b, in.c);
         23:     blocks.arithmetic.q_m().emplace_back(FF::zero());
         24:     blocks.arithmetic.q_1().emplace_back(in.a_scaling);
         25:     blocks.arithmetic.q_2().emplace_back(in.b_scaling);
gate number4
```

#### Improving LLDB Debugging

It can be quite hard to make sense of field_t circuit values that indirectly reference their contents, and even plain field values that are typically in montgomery form.
In command-line LLDB or VSCode debug console, run:

```
command script import ~/aztec-packages/barretenberg/cpp/scripts/lldb_format.py
```

Now when you `print` things with e.g. `print bigfield_t.get_value()` or inspect in VSCode (if you opened the debug console and put in these commands) then you will get pretty-printing of these types. This can be expanded fairly easily with more types if needed.

#### Debugging and profiling realistic ClientIVC flows


#### Running Realistic ClientIVC from barretenberg folder

Realistic IVC inputs pose a problem as the only code to sequence them requires a full end to end run.
One can run the fourth newest master commit for example (any master commit that has finished benchmarking can be used):
`barretenberg/cpp/bootstrap.sh bench_ivc origin/master~3`

To do a single benchmark you can do e.g.
`IVC_BENCH=ecdsar1+transfer_0_recursions+sponsored_fpc ./bootstrap.sh bench_ivc origin/master~3`

If one doesn't provide the commit, it generates these IVC inputs on the fly (depends on yarn-project having been bootstrapped).
To use these inputs manually, just abort after input download and run ClientIVC proving on those inputs (stored in `yarn-project/end-to-end/example-app-ivc-inputs-out`).

#### Using Tracy to Profile Memory/CPU/Gate Counts

Tracy is a tool that gives us an in-depth look at certain performance related metrics, including memory, CPU usage, time, and circuit gate counts.

See Tracy manual linked here <https://github.com/wolfpld/tracy> for in-depth Tracy documentation.

The basic use of Tracy is to run a benchmark with the `cmake --preset tracy-memory` build type, or any of the other tracy presets, create a capture file, then transfer it to a local machine for interactive UI introspection.

The steps to do this effectively are included in various scripts in cpp/scripts/. The main one to look at is the profile_tracy_capture_mainframe_view_local.sh script. This will capture on the mainframe and copy the script locally for you to view on a GUI. Unfortunately, this script is meant for internal use only, but there exists other variants of this script like profile_tracy_local.sh that don't depend on our internal mainframe.

##### Set Up and Script Usage

For profile_tracy_capture_mainframe_view_local.sh, the first step is copying this script locally either manually or using scp.
Now, you need to specify a few environment variables. The first is the USER. This is just your mainframe username, likely just your first name. Next, the BENCHMARK is the target or executable you are trying to build in barretenberg. The COMMAND should be set to the command you want to run, usually some google benchmark or some flow through bb. Lastly, the PRESET is defaulted to the memory one, but could be changed to a different one if you wanted to measure gates or time instead.

It shouldn't matter where the script is locally. You can now try running the script with the env vars set, or with them as arguments like this:

```
./profile_tracy_capture_mainframe_view_local.sh <USER> <BENCHMARK> <COMMAND>
```

The script will ssh to the mainframe and then build the BENCHMARK specified and run the COMMAND specified. It will capture the tracy data in a trace while the COMMAND is run. Then, it will scp this trace to your local machine, build the profiler with cmake, and pop open the GUI for viewing.

##### Using the GUI

The view will likely be cluttered with a lot of information. This is because we set our HARDWARE_CONCURRENCY to 16 by default, so you will get 16 different rows of zones, and then a row with the memory graph , and lastly a time graph. In the Options tab in the top left, we can declutter this through the visibility options which allow you to toggle on and off the zones for the non-main threads. We can usually opt to only keep the zones for the main thread, but maybe keeping around one or a few non-main threads is also useful.

The Find Zone tab is also of use to locate specific zones you care about. Searching for zones will highlight them in the GUI.

The Statistics tab will tell you about time spent in each zone and an overall breakdown of time. Note that time may be inaccurate since tracy adds overhead.

The Memory tab is very useful. It allows you to limit a range (Limit Range checkbox), look at all of the allocations (things that got allocated in the range) and active allocations (allocations that were not freed), and a rough Memory Map so you can get a sense of fragmentation. You can also see the stack trace for a particular memory alloc or free, if you click "alloc" or "free" while looking at the allocations or active allocations list, which is extremely useful. There's also a more global bottom up and top down allocation tree which can show the locations of major allocations.

In terms of general usage, you should be able to use scrolling or the WASD keys to zoom in/out and go left and right in the GUI. You can also Command/Ctrl + click + drag to look at particular range, which tells you the time of that range, and allows you to better pick the zone you want to limit to.

##### Adding Zones

Zones are how you can keep track of where you are relative in the code and how you can bucket allocations together. All of the colored blocks in the Main Thread row and other threads' rows refer to zones. You can nest zones in deeper and deeper scopes, which leads to stacks of these zones. To add a named zone, all you have to do is add PROFILE_THIS() or PROFILE_THIS_NAME(<name>) to a scope and it will create a zone. Note that you can't create multiple zones in the same scope.

##### Analyzing Fragmentation

The main memory graph will only keep track of a sum of active allocations, which can be misleading as it omits possible fragmentation. The most useful tools for analyzing fragmentation are in the Memory tab. Here, in the active allocations/allocations subtabs, you can see the exact addresses that certain allocations are located at. Moreover, you can look at when they are allocated and freed exactly, and the stack traces of those allocate/free calls. The Memory map also gives a more visual layout of memory, as it shows the layout of allocations in memory.

##### Final Thoughts

What's described here is mostly relating to memory, but should in part pertain to time, gate count, and other metric analysis that we have set up with tracy. It's likely that these instructions may become outdated, so please adjust accordingly. Also, there may be other valuable ways to use the tracy GUI that isn't mentioned here. Lastly, please keep in mind that tracy is an awesome tool for measuring memory, but because of the way its currently set up, the memory graph does not account for memory fragmentation, but only a sum of all of the active allocations at every step. Do not overfit to optimizing only this displayed Memory usage number; please account for real memory usage which must include memory fragmentation.

##### Getting Stack Traces from WASM

By default, the barretenberg.wasm.gz that is used by bb.js (aka barretenberg/ts) has debug symbols stripped.
One can get stack traces working from WASM by running root level ./bootstrap.sh (or otherwise building what you need) and then doing:
```
cmake --build --preset wasm-threads --target barretenberg-debug.wasm.gz
cp build-wasm-threads/bin/barretenberg-debug.wasm.gz ../ts/dest/node/barretenberg_wasm/barretenberg-threads.wasm.gz
```

This will mean that any yarn-project or barretenberg/ts tests that run will get stack traces with function names.
To get more detailed information use the following (NOTE: takes >10 minutes!):

```
cmake --preset wasm-threads-dbg
cmake --build --preset wasm-threads-dbg --target barretenberg-debug.wasm.gz
cp build-wasm-threads-dbg/bin/barretenberg-debug.wasm.gz ../ts/dest/node/barretenberg_wasm/barretenberg-threads.wasm.gz
```
