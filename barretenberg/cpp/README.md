# barretenberg / cpp

The C++ implementation of barretenberg's proving system. See
[`../README.md`](../README.md) for an overview of supported targets and
[`./CLAUDE.md`](./CLAUDE.md) for development conventions.

## WASM build (Emscripten)

The wasm presets target Emscripten + Node. The exact emsdk version is pinned
in [`../../.emsdk-version`](../../.emsdk-version) at the repo root; install
and activate it before configuring:

```bash
git clone https://github.com/emscripten-core/emsdk.git ~/emsdk
cd ~/emsdk
./emsdk install $(cat /path/to/repo/.emsdk-version)
./emsdk activate $(cat /path/to/repo/.emsdk-version)
source ./emsdk_env.sh
```

You also need **Node.js >= 22**.

Configure and build:

```bash
cmake --preset wasm-threads
cmake --build --preset wasm-threads --target bb
```

Each Emscripten executable lands in `build-wasm-threads/bin/` as a `.js`
loader plus a sibling `.wasm`. Tests are launched via the wrapper at
[`scripts/wasm-run`](./scripts/wasm-run), which forwards to Node with the
right flags (NODERAWFS, threading, memory budget, etc.):

```bash
cmake --build --preset wasm-threads --target ecc_tests
./scripts/wasm-run --dir=. ./build-wasm-threads/bin/ecc_tests

# or, equivalently, via the CMake-generated custom target:
cmake --build --preset wasm-threads --target run_ecc_tests
```

`wasm-run` accepts `--dir=PATH` (repeatable) for filesystem allowlisting.
The wasm module's `INITIAL_MEMORY` is a link-time constant baked into the
binary by the toolchain (`cmake/toolchains/wasm-emscripten.cmake`); to
change it, edit the toolchain and rebuild. The `--mem=BYTES` flag is
informational only -- it surfaces a requested budget via
`BB_WASM_INITIAL_MEMORY` for any caller that wants to read it, but the
loader does not honor a runtime override under `MODULARIZE=1`. See
`./scripts/wasm-run --help` for the full CLI.
