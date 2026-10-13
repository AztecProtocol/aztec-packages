> [!WARNING]
> If you are reading this on <https://github.com/AztecProtocol/barretenberg>: that repository is a mirror. Develop in <https://github.com/AztecProtocol/aztec-packages>; use the mirror only for reference.

# Barretenberg

Barretenberg (`bb`) is a C++ zkSNARK library: UltraHonk and Chonk provers and verifiers over BN254/Grumpkin, plus the AVM prover. Noir and Aztec use it. The `bb` CLI is described in [`cpp/src/barretenberg/bb/README.md`](cpp/src/barretenberg/bb/README.md).

## Development

The following packages are required for building from source:

- cmake >= 3.24
- Ninja (used by the presets as the default generator)
- A C++ compiler for the preset you use:
  - `default`: the `clang` on your PATH, version 14 or later; `homebrew`: brew's `llvm@20`
  - `clang20*` (used by `./bootstrap.sh`): [Zig](https://ziglang.org/), which wraps Clang
  - `debug*`, `asan`, `fuzzing*`: `clang-20` / `clang++-20`
  - `gcc`: gcc >= 10
- clang-format
- libstdc++ >= 12
- wasi-sdk at `/opt/wasi-sdk`, for the WASM presets
- libomp, only with `-DOMP_MULTITHREADING=ON` (default `OFF`)

To install these on Ubuntu, run:

```bash
sudo apt-get install cmake clang clang-format ninja-build libstdc++-12-dev
```

The default cmake version on 22.04 is 3.22.1, so it must be updated. You can get the latest version [here](https://cmake.org/download).

On macOS, update bash with `brew install bash`. It is recommended to use homebrew llvm on macOS to enable std::execution parallel algorithms. To do so:

- Install llvm with `brew install llvm`
- Add it to the path with `export PATH="/opt/homebrew/opt/llvm/bin:$PATH"` in your shell or profile file.

<details>
<summary><h3>Installing openMP (Linux)</h3></summary>

Only needed with `-DOMP_MULTITHREADING=ON`. You can get openMP from package managers. Ex. on Ubuntu:

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

</details>

### Quick Start

If you just want to use the `bb` binary and don't need to modify the source code, the easiest option is to install a pre-built binary using [bbup](bbup/README.md) (or `npm i -g @aztec-foundation/bb`):

```bash
curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/refs/heads/next/barretenberg/bbup/install | bash
bbup
bb --version
```

To build from source, use the bootstrap script. By default it uses a [Zig](https://ziglang.org/)-wrapped Clang for portable binaries (glibc 2.35+). This requires `zig` to be installed in addition to the dependencies listed above:

```bash
cd barretenberg/cpp
./bootstrap.sh               # Full build (native + WASM)
./bootstrap.sh build_native  # Native only (faster)
```

If you don't have Zig installed, you can use the `default` preset which only requires a standard Clang toolchain:

```bash
cd barretenberg/cpp
NATIVE_PRESET=default ./bootstrap.sh build_native
```

The resulting binaries will be at `build/bin/bb` and `build/bin/bb-avm`. AVM is on by default; `AVM=0 ./bootstrap.sh build_native` skips `bb-avm` and builds faster. For incremental development builds and the preset table, see [`cpp/CLAUDE.md`](cpp/CLAUDE.md) "Build".

### Build Options and Instructions

CMake can be passed various build options on its command line:

- `-DCMAKE_BUILD_TYPE=Debug | Release | RelWithAssert`: Build types.
- `-DDISABLE_ASM=ON | OFF`: Enable/disable x86 assembly.
- `-DDISABLE_ADX=ON | OFF`: Enable/disable ADX assembly instructions (for older cpu support).
- `-DMULTITHREADING=ON | OFF`: Enable/disable multithreading.
- `-DOMP_MULTITHREADING=ON | OFF`: Enable/disable multithreading that uses OpenMP.
- `-DAVM=ON | OFF`: Build the AVM (`vm2` and `bb-avm`). Default `ON`.
- `-DFUZZING=ON | OFF`: Build only the fuzzing harnesses.
- `-DENABLE_ASAN=ON | OFF`: Address sanitizer.
- `-DENABLE_STACKTRACES=ON | OFF`: Stack traces on assertion.
- `-DENABLE_TRACY=ON | OFF`: Tracy profiling.
- `-DBB_LITE=ON | OFF`: Exclude server-side subsystems (lmdb, world_state, ipc, nodejs_module).

The `option()` lines in `cpp/CMakeLists.txt` list them all. Various presets are defined in CMakePresets.json for scenarios such as instrumentation, cross-compiling and targets such as WASM.

#### WASM build

The WASM presets need wasi-sdk at `/opt/wasi-sdk`. To build:

```bash
cmake --preset wasm
cmake --build --preset wasm --target barretenberg.wasm
```

The resulting wasm binary will be at `./build-wasm/bin/barretenberg.wasm`.

To run the tests, you'll need to install `wasmtime`.

```
curl https://wasmtime.dev/install.sh -sSf | bash
```

Tests can be built and run like this, from `barretenberg/cpp` (`scripts/wasmtime.sh` passes the thread flags and mounts `~/.bb-crs` and the current directory):

```bash
cmake --build --preset wasm --target ecc_tests
scripts/wasmtime.sh build-wasm/bin/ecc_tests --gtest_filter=filtertext
```

#### Fuzzing build

See [cpp/docs/Fuzzing.md](cpp/docs/Fuzzing.md). Sanitizer builds use the presets `fuzzing-asan`, `asan` and `ubsan`. Fuzzers can be orders of magnitude slower with ASan or UBSan, so run a non-sanitized build first, minimize the testcase and then run it for a bit of time with sanitizers. If ASan cannot find llvm-symbolizer, set `export ASAN_SYMBOLIZER_PATH=<PATH_TO_SYMBOLIZER>`.

#### Test coverage build

Run `cpp/scripts/test_coverage.sh` from `barretenberg/cpp`. It builds with the `clang20-coverage` preset, runs the tests and writes an HTML report to `build-coverage/coverage-report/index.html`. On the mainframe, limit its impact with `taskset` and `nice`: profiling instrumentation is very heavy.

### Formatting

Code is formatted using `clang-format` and the `./cpp/format.sh` script which is called via a git pre-commit hook.

> [!TIP]
> A default configuration for VS Code is provided by the file [`barretenberg.code-workspace`](barretenberg.code-workspace). These settings can be overridden by placing configuration files in `.vscode/`.
> If you've installed the C++ Vscode extension, configure it to format on save!

### Testing

Each module has its own tests, in a target named `<module>_tests`. After configuring `build/`, list them with `ninja -C build -t targets | grep _tests:`, or list the CI test commands with `./bootstrap.sh test_cmds` in `barretenberg/cpp`.

e.g. To build and run `ecc` tests:

```bash
# Replace the `default` preset with whichever preset you want to use
cmake --build --preset default --target ecc_tests
cd build
./bin/ecc_tests
```

Running the entire suite of tests using `ctest`:

```bash
cmake --build --preset default --target test
```

`./bootstrap.sh test` in `barretenberg/cpp` runs every native test binary the way CI does.

You can run specific tests, e.g.

```
./bin/ecc_tests --gtest_filter=scalar_multiplication.*
```

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

Some modules have benchmarks. The build targets are named `<module_name>_bench`. To build and run, for example `ecc` benchmarks.

```bash
# Replace the `default` preset with whichever preset you want to use
cmake --build --preset default --target ecc_bench
cd build
./bin/ecc_bench
```

For numbers you can publish, run benchmarks on the remote bencher: see [cpp/scripts/README.md](cpp/scripts/README.md). Benchmark results from CI are on the benchmark dashboard.

### Debugging

#### Debugging Verification Failures

The CircuitChecker::check_circuit function is used to get the gate index and block information about a failing circuit constraint.
If you are in a scenario where you have a failing call to check_circuit and wish to get more information out of it than just the gate index, you can use this feature to get a stack trace.

Usage instructions:

- On ubuntu (or our mainframe accounts) use `sudo apt-get install libdw-dev libelf-dev` to support trace printing
- Use `cmake --preset debug-fast` and `cmake --build --preset debug-fast`. The preset sets `ENABLE_STACKTRACES=ON`, which enables the backward-cpp dependency and the `CHECK_CIRCUIT_STACKTRACES` compile definition.
- Run any case where you have a failing check_circuit call, you will now have a stack trace illuminating where this constraint was added in code.

Caveats:

- This works best for code that is not overly generic, i.e. where just the sequence of function calls carries a lot of information. It is possible to tag extra data along with the stack trace, this can be done as a followup, please leave feedback if desired.
- There are certain functions like `assert_equals` that can cause gates that occur _before_ them to fail. If this would be useful to automatically report, please leave feedback.

The trace lists the call stack (most recent call last) from the gtest runner down to the builder call that created the failing gate, with source lines around each frame, followed by the failing gate number.

#### Improving LLDB Debugging

It can be quite hard to make sense of field_t circuit values that indirectly reference their contents, and even plain field values that are typically in montgomery form.
In command-line LLDB or VSCode debug console, run:

```
command script import ~/aztec-packages/barretenberg/cpp/scripts/lldb_format.py
```

Now when you `print` things with e.g. `print bigfield_t.get_value()` or inspect in VSCode (if you opened the debug console and put in these commands) then you will get pretty-printing of these types. This can be expanded fairly easily with more types if needed.

#### Running Realistic Chonk from barretenberg folder

Realistic IVC inputs are pinned in CI and downloaded into
`barretenberg/cpp/chonk-pinned-flows`.
Run the benchmark flow with:
`CI=1 barretenberg/cpp/bootstrap.sh bench_ivc`

`CI=1` is required for the results to be visible. `bench_ivc` also builds the labs submodule (`make labs-yarn-project`). Set `NO_WASM=1` to skip the WASM benchmarks.

To do a single benchmark you can do e.g.
`CI=1 barretenberg/cpp/bootstrap.sh bench_ivc transfer_0_recursions+sponsored_fpc`

To use these inputs manually, run `barretenberg/cpp/scripts/chonk_inputs.sh download` and then point
`bb prove --scheme chonk` at the downloaded flow's `ivc-inputs.msgpack`.

#### Using Tracy to Profile Memory/CPU/Gate Counts

[Tracy](https://github.com/wolfpld/tracy) shows memory, CPU usage, time and circuit gate counts.

- Build with one of the presets `tracy-memory`, `tracy-time-instrumented`, `tracy-time-sampled` or `tracy-gates`.
- For local use, run `cpp/scripts/profile_tracy_local.sh`.
- On the Aztec mainframe, `cpp/scripts/profile_tracy_capture_mainframe_view_local.sh <USER> <BENCHMARK> [COMMAND]` builds `BENCHMARK` on `<USER>-box`, captures a trace while `COMMAND` runs, copies it to your machine and opens the Tracy GUI. Set `PRESET` to choose the preset (default `tracy-memory`). It runs with `HARDWARE_CONCURRENCY=16` by default, so the GUI shows 16 thread rows.
- To add a named zone, add `BB_BENCH_TRACY()` or `BB_BENCH_TRACY_NAME(<name>)` to a scope. You can't create multiple zones in the same scope.
- The memory graph shows only the sum of active allocations, not fragmentation. Use the Memory tab (allocation addresses, alloc/free stack traces, memory map) to analyze fragmentation, and do not optimize only the displayed memory number.

##### Getting Stack Traces from WASM

By default, the barretenberg.wasm.gz that is used by bb.js (`barretenberg/ts/bb.js`) has debug symbols stripped.
One can get stack traces working from WASM by building what you need (e.g. root level `make fast`) and then doing, from `barretenberg/cpp`:
```
cmake --build --preset wasm-threads --target barretenberg-debug.wasm.gz
cp build-wasm-threads/bin/barretenberg-debug.wasm.gz ../ts/bb.js/dest/node/barretenberg_wasm/barretenberg-threads.wasm.gz
```

This will mean that any labs/yarn-project or bb.js tests that run will get stack traces with function names.
To get more detailed information use the following (NOTE: takes >10 minutes!):

```
cmake --preset wasm-threads-dbg
cmake --build --preset wasm-threads-dbg --target barretenberg-debug.wasm.gz
cp build-wasm-threads-dbg/bin/barretenberg-debug.wasm.gz ../ts/bb.js/dest/node/barretenberg_wasm/barretenberg-threads.wasm.gz
```
