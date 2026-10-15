# barretenberg/cpp

Bootstrap modes:

- `./bootstrap.sh` (same as `./bootstrap.sh build`) => native + WASM build through root `make bb-cpp`, using the build cache. Needed for other components.
- `AVM=0 ./bootstrap.sh build_native` => native build without `vm2` and the slow `bb-avm` target (preset `clang20-no-avm`). Good for verifying compilation works. Needed to build ts/

## `bb` vs `bb-avm`: which binary do downstream scripts pick?

`barretenberg/cpp/scripts/find-bb` returns `bb-avm` by default (when `AVM` is unset or `AVM=1`) and `bb` only when `AVM=0`. `noir-projects/fnd/noir-protocol-circuits/bootstrap.sh` and most other downstream tooling go through `find-bb`, so when those scripts run "the bb binary", they are running `bb-avm`.

Consequence: when changing C++ that affects VK derivation, proving, or anything else exercised by downstream bootstrap scripts, `cmake --build build --target bb` is **not enough** — `bb` is non-AVM and will not be picked up. You must rebuild the AVM-enabled binary:

```bash
cd barretenberg/cpp
cmake --build build --target bb-avm
```

`find-bb` reads `build/` (preset `clang20` unless `NATIVE_PRESET` is set), so configure `build/` as described in "Build" below. Or run `./bootstrap.sh` (full build), which produces both. Symptom of forgetting: downstream scripts keep failing with the *same* error after your "fix" because they are still running the stale `bb-avm`.

## Build

This section is the build recipe for barretenberg C++; other docs link here. AVM is ON by default (`option(AVM ... ON)` in `CMakeLists.txt`), so a normal build includes `vm2` and `bb-avm`.

Development commands (from barretenberg/cpp):
```bash
cmake --preset clang20    # Configure build/ (Release, AVM on)
cd build && ninja <test>  # Build specific target
```
Do not add the `-j` flag to ninja; the default is optimal.

`clang20` is the preset family that `./bootstrap.sh`, `scripts/find-bb`, `acir_tests` and CI use. It needs zig (`scripts/zig-cc.sh`) and a built avm-transpiler (`avm-transpiler/target/release/libavm_transpiler.a`; root `make bb-cpp-native` builds it). Without them, use `cmake --preset default` (system `clang`, avm-transpiler optional).

| Preset | Build type | Compiler | Build dir |
| --- | --- | --- | --- |
| `default` | Release | system `clang` | `build/` |
| `clang20` | Release | zig wrappers | `build/` |
| `clang20-no-avm` | Release, `AVM=OFF` (no `vm2`, no `bb-avm`) | zig wrappers | `build/` |
| `clang20-assert` | RelWithAssert (`-O3 -UNDEBUG`): `assert` and `BB_ASSERT_DEBUG` fire; AVM column information compiled in | zig wrappers | `build/` |
| `debug-fast` | `-O2` with debug info and stack traces | `clang-20` | `build-debug-fast/` |

There is no `release` preset. `default`, `clang20` and `clang20-no-avm` are Release builds with `NDEBUG` set: `BB_ASSERT` still fires, but bare `assert`, `BB_ASSERT_DEBUG` (`common/assert.hpp`) and the AVM column information gated on `!defined(NDEBUG)` are compiled out. Use `clang20-assert` when those must be active.

The first four presets share `build/` (`scripts/preset-build-dir`). Switching between them in the same `build/` (compiler family, build type, or `AVM`) invalidates the CMake cache and recompiles everything. Pick one per checkout.

Common test targets:
  - `ultra_honk_tests` - Ultra Honk circuit tests
  - `chonk_tests` - Chonk tests
  - `dsl_tests` - ACIR/DSL tests (acir_format/, mock_verifier_inputs)
  - `hypernova_tests` - HyperNova folding tests
  - `eccvm_tests` - ECCVM circuit tests
  - `translator_vm_tests` - Translator circuit tests
  - `goblin_tests` - Goblin tests
  - `stdlib_*_tests` - Standard library tests
  - `crypto_*_tests` - Cryptographic primitive tests
  - `vm2_tests` - AVM tests (not built with `AVM=OFF`)

To find test targets: `ninja -t targets | grep "_tests:" | grep -v cmake`

To check the current AVM setting: `grep "AVM:" build/CMakeCache.txt`

## Running the full bb test suite

`./bootstrap.sh test` runs every native bb test binary. It takes 5+ minutes and uses significant CPU. Ask the user before running it, unless they explicitly told you to test. Run it when a change plausibly affects more than one bb module. Always run it when a change rotates verification keys or shifts a widely-included constant (`barretenberg/cpp/src/barretenberg/constants.hpp`, `dsl/acir_format/gate_count_constants.hpp`, public-input formulas).

Two operational rules for an honest signal:
- **Build all targets first.** Run plain `ninja` (no target) before `./bootstrap.sh test`. `ninja <one_target>` leaves other test binaries stale and the suite will pass against out-of-date code.
- **Use `NO_FAIL_FAST=1` for multi-failure passes.** The default halts on the first failure, so a constants-update with several drifts forces a fix → 5-minute rerun → next failure loop. `NO_FAIL_FAST=1 ./bootstrap.sh test` enumerates every failure in one pass.

### Barretenberg module components:

- **commitment_schemes/** - Polynomial commitment schemes (KZG, IPA)
- **crypto/** - Cryptographic primitives (hashes, merkle trees, fields)
- **ecc/** - Elliptic curve operations
- **flavor/** - Circuit proving system flavors (Ultra, Mega)
- **honk/** - The Honk proving system implementation
- **stdlib/** - Circuit-friendly implementations of primitives
- **ultra_honk/** - Ultra Honk prover/verifier
- **chonk/** - Client-side IVC (Incremental Verifiable Computation)
- **bbapi/** - BB API for external interaction. If changing here, we will also want to update the ts/ folder because bb.js consumes this. (first build ninja bb in build/)
- **dsl/** - ACIR definition in C++. This is dictated by the serialization in noir/, so refactor should generally not change the structure without confirming that the user is changing noir.
- **vm2/** - AVM implementation (built by default; `AVM=OFF` skips it). If working in vm2, use barretenberg/cpp/src/barretenberg/vm2/CLAUDE.md

## Code formatting

All C++ files must be formatted with clang-format before committing:
```bash
clang-format-20 -i <files>
```

## C++ invariants

These are required: violating them will compile on native but break WASM, or skew test output in CI. Use the listed alternative unconditionally.

- **Logging: use `info(...)` / `vinfo(...)` from `barretenberg/common/log.hpp`, never `std::cout` or `std::cerr`.** The macros route through `log_function` and respect `bb_log_level`; direct `std::cout` is unfiltered, uncaptured in CI logs, and skews benchmark output.
- **Aborts and exceptions: use `throw_or_abort(msg)` from `barretenberg/common/throw_or_abort.hpp`, never bare `throw` or `std::abort()`.** WASM builds set `BB_NO_EXCEPTIONS`, which turns `throw` into `abort()` — bare `throw` compiles differently and misformats the message, and raw `std::abort()` drops the message entirely. For header-only libraries that must use exception syntax, use the `THROW`/`RETHROW` macros from `common/try_catch_shim.hpp`.
- **Assertions: use `BB_ASSERT(cond, msg)` / `BB_ASSERT_EQ` / `BB_ASSERT_NEQ` / `BB_ASSERT_GT` / etc. from `barretenberg/common/assert.hpp`, never bare `assert(...)`.** `BB_ASSERT` hooks into the benchmark-assertion framework and has distinct debug/release behavior; `assert` is stripped in release builds and silently diverges in WASM.
- **Debug builds: use `clang20-assert` or `debug-fast` for correctness work.** The Release presets (`default`, `clang20`) set `NDEBUG`, so `BB_ASSERT_DEBUG` and bare `assert` checks do not fire (`BB_ASSERT` always does). See "Build" above.

## Benchmarking:

**IMPORTANT**: In the barretenberg context, "bench" or "benchmark" almost always means running `benchmark_remote.sh` for the given target on a remote benchmarking machine.

**Never benchmark against test binaries (`*_tests`) — the results will always be wrong.** Test circuits are small mocks whose cost profile does not resemble real proving workloads. Benchmark against real inputs: the pinned Chonk flows (`scripts/chonk_inputs.sh download`, then `bb prove --scheme chonk --ivc_inputs_path chonk-pinned-flows/<flow>/ivc-inputs.msgpack`) or the dedicated `*_bench` targets.

To run benchmarks for a specific target:
```bash
cd barretenberg/cpp
./scripts/benchmark_remote.sh <target_name>
```

Common benchmark targets:
- `pippenger_bench` - MSM/Pippenger benchmarks
- `ultra_honk_bench` - Ultra Honk prover benchmarks
- `commitment_schemes_bench` - Commitment scheme benchmarks

`benchmark_remote.sh` builds the target locally (preset `clang20-no-avm`), copies the binary to the remote bencher and runs it there. It needs `BB_SSH_KEY`, `BB_SSH_INSTANCE` and `BB_SSH_CPP_PATH`; see `scripts/README.md` for the setup.

## Proof Size Constants

When making changes that affect proof sizes (e.g., pairing points encoding, public inputs structure), you must update constants in multiple places:

1. **C++ static_asserts** in `dsl/acir_format/mock_verifier_inputs.test.cpp` - These catch size changes at compile time
2. **Noir constants** in `noir-projects/fnd/noir-protocol-circuits/crates/types/src/constants.nr`
3. **Generated constants** - All projections (`aztec_constants.hpp`, `constants.gen.ts`, `ConstantsGen.sol`,
   `constants_gen.pil`) regenerate automatically at build time; none need a manual step. If AVM-related constants
   changed, also run `scripts/avm2_gen.sh` and commit the resulting `vm2/generated` changes.

Key constants to watch:
- `RECURSIVE_PROOF_LENGTH` - UltraHonk proof + DefaultIO public inputs
- `CHONK_PROOF_LENGTH` - ChonkProof + HidingKernelIO public inputs
- `PAIRING_POINTS_SIZE` - Size of pairing points in public inputs
- `HIDING_KERNEL_PUBLIC_INPUTS_SIZE` - Size of HidingKernelIO

If C++ static_asserts fail after your changes, update both the assert values and the corresponding Noir constants, then
run the generation commands above.

## Prover.toml Fixtures

Proof-length-affecting changes (e.g. `CHONK_PROOF_LENGTH` bumps from MegaFlavor entity additions) make the committed `Prover.toml` fixtures stale. `nargo execute --program-dir <crate>` then fails with `Type Array { length: N, typ: Field } is expected to have length N but value Vec(...)`.

Regeneration is split across two commands. The block-root, block-merge, checkpoint, tx-merge, and root rollup samples come from the prover-client suite, which drives the simulated orchestrator and needs no L1 sandbox:

```bash
scripts/labs_env.sh bash -c 'cd yarn-project && AZTEC_GENERATE_TEST_DATA=1 yarn workspace @aztec-labs/prover-client test regenerate_rollup_sample_inputs'
```

The private-kernel samples and the transaction-base rollup samples (`rollup-tx-base-private`, `rollup-tx-base-public`) need real client-proved transactions, so they come from the e2e prover full test with fake proofs:

```bash
scripts/labs_env.sh bash -c 'cd yarn-project && AZTEC_GENERATE_TEST_DATA=1 FAKE_PROOFS=1 yarn workspace @aztec-labs/end-to-end test single-node/prover/server/full.test'
```

Run both from the repository root. `scripts/labs_env.sh` runs the command inside the `labs/` submodule (aztec-node). `FAKE_PROOFS=1` skips real proving. Both write into `noir-projects/fnd/noir-protocol-circuits/crates/<circuit>/Prover.toml` of this repository, so they work only with aztec-node checked out as `labs/`. The `update-prover-toml` skill has the details.

Verify with `nargo execute --program-dir noir-projects/fnd/noir-protocol-circuits/crates/<crate>` for any previously-failing crate; should print `Circuit witness successfully solved`.

## Verification Keys

**IMPORTANT**: When making barretenberg changes that could affect verification keys, you must verify that VKs haven't changed unexpectedly, or
update them if the changes are intentional.

### Checking if VKs have changed

Prerequisites: Build barretenberg native code first.

```bash
cd barretenberg/cpp
./bootstrap.sh build_native
```

Run the VK check script from barretenberg/cpp/scripts:

```bash
barretenberg/cpp/scripts/chonk_inputs.sh check
```

Expected result: Script exits successfully if VKs are unchanged, or shows that VKs have changed.

### Updating VKs (when changes are intentional)

**IMPORTANT**: Never update the VKs without asking permission first. When asking for permission, explain why you think the VK update is to be expected.

If VKs have changed and this is expected due to your modifications, refresh the pinned inputs. Prefer the PR `ci-refresh-chonk` label (see "Example IVC inputs" below). The local equivalent is:

```bash
barretenberg/cpp/scripts/chonk_inputs.sh update
```

`update` captures new flows, VK-checks them, uploads a new tarball to the artifact bucket and rewrites `chonk-inputs.hash`. It is a remote write and needs bucket credentials.

### Verifying VK validity (proving the updated inputs)

Proving the pinned inputs is handled by tests, not by `chonk_inputs.sh`. To verify the C++ pinned input path locally, run:

```bash
barretenberg/cpp/scripts/chonk_inputs.sh download
barretenberg/cpp/scripts/run_test.sh bbapi_tests ChonkPinnedIvcInputsTest.AllPinnedFlows
```

For bb.js, run:

```bash
barretenberg/cpp/scripts/chonk_inputs.sh download
barretenberg/ts/bb.js/scripts/run_test.sh bbapi/chonk_pinned_inputs.test.js
```

Typical workflow

1. Make barretenberg changes
2. Build native code: `cd barretenberg/cpp && ./bootstrap.sh build_native`
3. Check VKs: `barretenberg/cpp/scripts/chonk_inputs.sh check`
4. If VKs changed intentionally (after asking): add the `ci-refresh-chonk` label, or run `barretenberg/cpp/scripts/chonk_inputs.sh update`

## Example IVC inputs

Example IVC inputs (msgpack files) for `bb prove --scheme chonk` are pinned to a fixed CI tarball. Download them from the repo root with:

```bash
barretenberg/cpp/scripts/chonk_inputs.sh download
```

This creates `barretenberg/cpp/chonk-pinned-flows/<flow>/ivc-inputs.msgpack`. To intentionally refresh the pinned tarball, use the PR `ci-refresh-chonk` label or put `--ci-refresh-chonk` in the head commit message.

## Memory profiling

The `--memory_profile_out <file>` flag on `bb prove` outputs a JSON array of memory checkpoints (`heap_mb`: live heap via `mallinfo2` on Linux, peak RSS elsewhere; `common/memory_profile.hpp`) at key proving stages (after alloc, trace, oink, sumcheck, accumulate) for each circuit, with circuit names and indices. Only `--scheme chonk` writes it.

```bash
cd barretenberg/cpp
./build/bin/bb prove \
  --scheme chonk \
  --ivc_inputs_path <path-to>/ivc-inputs.msgpack \
  -o /tmp/proof-out \
  -v \
  --memory_profile_out /tmp/proof-out/memory_profile.json
```

The extraction script converts the JSON into dashboard benchmark entries (one overlaid line per circuit stage, tracked across commits):

```bash
echo '[]' > /tmp/proof-out/benchmarks.bench.json
python3 scripts/extract_memory_benchmarks.py /tmp/proof-out "app-proving/flow/native"
```

In CI, this is integrated into `ci_benchmark_ivc_flows.sh` (native only) and uploaded to the benchmark dashboard.
