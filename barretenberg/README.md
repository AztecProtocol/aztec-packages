# :warning: This is not an actively developed repository, it is a mirror. See https://github.com/AztecProtocol/aztec-packages :warning:
# :warning: **https://github.com/AztecProtocol/barretenberg is a mirror-only repository, please only use https://github.com/AztecProtocol/aztec-packages. Do not use this for any purpose other than reference.** :warning: </span>

## Barretenberg, an optimized elliptic curve library for the bn128 curve, and PLONK SNARK prover
**This code is highly experimental, use at your own risk!**

### Benchmarks!

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

### Dependencies

- cmake >= 3.24
- Ninja (used by the presets as the default generator)
- clang >= 16 or gcc >= 10
- clang-format
- libstdc++ >= 12
- libomp (if multithreading is required. Multithreading can be disabled using the compiler flag `-DMULTITHREADING 0`)

#### Ubuntu

To install on Ubuntu, run:

```
sudo apt-get install cmake clang clang-format ninja-build libstdc++-12-dev
```

The default cmake version on 22.04 is 3.22.1, so it must be updated. You can get the latest version [here](https://cmake.org/download).

#### MacOS

When running MacOS Sonoma 14.2.1 the following steps are necessary:

- update bash with `brew install bash`
- update [cmake](https://cmake.org/download)

### Installing openMP (Linux)

Install from source:

```
git clone -b release/10.x --depth 1 https://github.com/llvm/llvm-project.git \
  && cd llvm-project && mkdir build-openmp && cd build-openmp \
  && cmake ../openmp -DCMAKE_C_COMPILER=clang -DCMAKE_CXX_COMPILER=clang++ -DLIBOMP_ENABLE_SHARED=OFF \
  && cmake --build . --parallel \
  && cmake --build . --parallel --target install \
  && cd ../.. && rm -rf llvm-project
```

Or install from a package manager, on Ubuntu:

```
sudo apt-get install libomp-dev
```

> Note: on a fresh Ubuntu Kinetic installation, installing OpenMP from source yields a `Could NOT find OpenMP_C (missing: OpenMP_omp_LIBRARY) (found version "5.0")` error when trying to build Barretenberg. Installing from apt worked fine.

### Getting started

Run the bootstrap script. (The bootstrap script will build both the native and wasm versions of barretenberg)

```
cd cpp
./bootstrap.sh
```

### Installing

After the project has been built, such as with `./bootstrap.sh`, you can install the library on your system:

```sh
cmake --install build
```

### Formatting

Code is formatted using `clang-format` and the `./cpp/format.sh` script which is called via a git pre-commit hook.
If you've installed the C++ Vscode extension you should configure it to format on save.

### Testing

Each module has its own tests. e.g. To build and run `ecc` tests:

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

### Benchmarks

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

### CMake Build Options

CMake can be passed various build options on its command line:

- `-DCMAKE_BUILD_TYPE=Debug | Release | RelWithAssert`: Build types.
- `-DDISABLE_ASM=ON | OFF`: Enable/disable x86 assembly.
- `-DDISABLE_ADX=ON | OFF`: Enable/disable ADX assembly instructions (for older cpu support).
- `-DMULTITHREADING=ON | OFF`: Enable/disable multithreading.
- `-DOMP_MULTITHREADING=ON | OFF`: Enable/disable multithreading that uses OpenMP.
- `-DTESTING=ON | OFF`: Enable/disable building of tests.
- `-DBENCHMARK=ON | OFF`: Enable/disable building of benchmarks.
- `-DFUZZING=ON | OFF`: Enable building various fuzzers.

If you are cross-compiling, you can use a preconfigured toolchain file:

- `-DCMAKE_TOOLCHAIN_FILE=<filename in ./cmake/toolchains>`: Use one of the preconfigured toolchains.

### WASM build

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

### Fuzzing build

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

### Test coverage build

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

### VS Code configuration

A default configuration for VS Code is provided by the file [`barretenberg.code-workspace`](barretenberg.code-workspace). These settings can be overridden by placing configuration files in `.vscode/`.

### Integration tests with Aztec in Monorepo

CI will automatically run integration tests against Aztec. It is located in the `barretenberg` folder.

### Integration tests with Aztec in Barretenberg Standalone Repo

When working on a PR, you may want to point this file to a different Aztec branch or commit, but then it should probably be pointed back to master before merging.

### Testing locally in docker

A common issue that arises is that our CI system has a different compiler version e.g. namely for GCC. If you need to mimic the CI operating system locally you can use bootstrap_docker.sh or run dockerfiles directly. However, there is a more efficient workflow for iterative development:

```
cd barretenberg/cpp
./scripts/docker_interactive.sh
mv build build-native # your native build folders are mounted, but will not work! have to clear them
cmake --preset gcc ;  cmake --build build
```

This will allow you to rebuild as efficiently as if you were running native code, and not have to see a full compile cycle.

### Building docs

If doxygen is installed on the system, you can use the **build_docs** target to build documentation, which can be configured in vscode CMake extension or using

```bash
cmake --build . --target build_docs
```

in the cpp/build directory. The documentation will be generated in cpp/docs/build folder. You can then run a python http server in the folder:

```bash
python3 -m http.server <port>
```

and tunnel the port through ssh.

### Debugging Verifification Failures

The CicuitChecker::check_circuit function is used to get the gate index and block information about a failing circuit constraint.
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


### Improving LLDB Debugging

It can be quite hard to make sense of field_t circuit values that indirectly reference their contents, and even plain field values that are typically in montgomery form.
In command-line LLDB or VSCode debug console, run:

```
command script import ~/aztec-packages/barretenberg/cpp/scripts/lldb_format.py
```

Now when you `print` things with e.g. `print bigfield_t.get_value()` or inspect in VSCode (if you opened the debug console and put in these commands) then you will get pretty-printing of these types. This can be expanded fairly easily with more types if needed.


### Using Tracy to Profile Memory/CPU

See Tracy manual linked here https://github.com/wolfpld/tracy for in-depth Tracy documentation.

The basic use of Tracy is to run a benchmark with the `cmake --preset tracy` build type, create a capture file, then
transfer it to a local machine for interactive UI introspection.

All the steps to do this effectively are included in cpp/scripts/benchmark_tracy.sh