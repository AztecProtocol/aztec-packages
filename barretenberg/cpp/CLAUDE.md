# barretenberg/cpp

Bootstrap modes:

- `./bootstrap.sh` => full build, needed for other components
- `./bootstrap.sh build` => standard build
- `AVM=0 ./bootstrap.sh build_native` => quick build without slow bb-avm target. Good for verifying compilation works. Needed to build ts/

## `bb` vs `bb-avm`: which binary do downstream scripts pick?

`barretenberg/cpp/scripts/find-bb` returns `bb-avm` by default (when `AVM` is unset or `AVM=1`) and `bb` only when `AVM=0`. `noir-projects/noir-protocol-circuits/bootstrap.sh` and most other downstream tooling go through `find-bb`, so when those scripts run "the bb binary", they are running `bb-avm`.

Consequence: when changing C++ that affects VK derivation, proving, or anything else exercised by downstream bootstrap scripts, `cmake --build build --target bb` is **not enough** — `bb` is non-AVM and will not be picked up. You must rebuild the AVM-enabled binary:

```bash
cd barretenberg/cpp
cmake --preset default -DAVM=ON
cmake --build build --target bb-avm
```

Or just run `./bootstrap.sh` (full build), which produces both. Symptom of forgetting: downstream scripts keep failing with the *same* error after your "fix" because they are still running the stale `bb-avm`.

Development commands (from barretenberg/cpp):
```bash
cmake --preset default    # Configure (AVM disabled by default)
cd build && ninja <test>  # Build specific target
```
NOTE: DO NOT add the -j flag to ninja, default is optimal.

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
  - `vm2_tests` - AVM tests (requires AVM=ON, see below)

To find test targets: `ninja -t targets | grep "_tests:" | grep -v cmake`

### Building with AVM enabled

By default, AVM is disabled for faster builds. To build vm2_tests or work on AVM code:

```bash
cd barretenberg/cpp
cmake --preset default -DAVM=ON   # Reconfigure with AVM enabled
cd build && ninja vm2_tests       # Build AVM tests
```

To check current AVM setting: `grep "AVM:" build/CMakeCache.txt`

Note: Once you enable AVM, subsequent `ninja` calls will include AVM targets until you reconfigure.

## Running the full bb test suite

`./bootstrap.sh test` runs every native bb test binary; it takes 5+ minutes and burns significant CPU. Run it (asking the user before kicking it off, unless they explicitly told you to test) whenever a change plausibly affects more than one bb module, and ALWAYS run it when a change rotates verification keys or shifts a widely-included constant (`barretenberg/cpp/src/barretenberg/constants.hpp`, `gate_count_constants.hpp`, public-input formulas, etc.).

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
- **vm2/** - AVM implementation (not enabled, but might need to be fixed for compilation issues in root ./bootstrap.sh). If working in vm2, use barretenberg/cpp/src/barretenberg/vm2/CLAUDE.md

## Code formatting

All C++ files must be formatted with clang-format before committing:
```bash
clang-format-20 -i <files>
```

## C++ invariants

These are load-bearing: violating them will compile on native but break WASM, or skew test output in CI. Use the listed alternative unconditionally.

- **Logging: use `info(...)` / `vinfo(...)` from `barretenberg/common/log.hpp`, never `std::cout` or `std::cerr`.** The macros route through `log_function` and respect `bb_log_level`; direct `std::cout` is unfiltered, uncaptured in CI logs, and skews benchmark output.
- **Aborts and exceptions: use `throw_or_abort(msg)` from `barretenberg/common/throw_or_abort.hpp`, never bare `throw` or `std::abort()`.** WASM builds set `BB_NO_EXCEPTIONS`, which turns `throw` into `abort()` — bare `throw` compiles differently and misformats the message, and raw `std::abort()` drops the message entirely. For header-only libraries that must use exception syntax, use the `THROW`/`RETHROW` macros from `common/try_catch_shim.hpp`.
- **Assertions: use `BB_ASSERT(cond, msg)` / `BB_ASSERT_EQ` / `BB_ASSERT_NEQ` / `BB_ASSERT_GT` / etc. from `barretenberg/common/assert.hpp`, never bare `assert(...)`.** `BB_ASSERT` hooks into the benchmark-assertion framework and has distinct debug/release behavior; `assert` is stripped in release builds and silently diverges in WASM.
- **Release builds: do not reach for the `release` CMake preset unless the user is reproducing a performance issue.** Debug/default presets are much faster to compile and sufficient for correctness work.

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

The remote benchmark script:
- Runs on a dedicated benchmarking machine for consistent results
- Automatically builds the target if needed
- Returns performance metrics and timing data
- Should be used instead of local benchmarks for performance validation

## Proof Size Constants

When making changes that affect proof sizes (e.g., pairing points encoding, public inputs structure), you must update constants in multiple places:

1. **C++ static_asserts** in `dsl/acir_format/mock_verifier_inputs.test.cpp` - These catch size changes at compile time
2. **Noir constants** in `noir-projects/noir-protocol-circuits/crates/types/src/constants.nr`
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

Regenerate via the e2e prover full test with fake proofs:

```bash
cd yarn-project
AZTEC_GENERATE_TEST_DATA=1 FAKE_PROOFS=1 yarn workspace @aztec/end-to-end test e2e_prover/full.test
```

`FAKE_PROOFS=1` skips real proving — runs in ~2 min (orchestrator + witness generation only). Writes 12 `Prover.toml` files under `noir-projects/noir-protocol-circuits/crates/<circuit>/Prover.toml`.

For circuits not exercised by `full.test.ts` (`rollup-tx-merge`, `rollup-block-root`, `rollup-block-root-single-tx`, `rollup-block-merge`, `rollup-checkpoint-root`, `rollup-block-root-first-empty-tx`), additionally run:

```bash
AZTEC_GENERATE_TEST_DATA=1 yarn workspace @aztec/prover-client test orchestrator_single_checkpoint
```

Verify with `nargo execute --program-dir noir-projects/noir-protocol-circuits/crates/<crate>` for any previously-failing crate; should print `Circuit witness successfully solved`.

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

If VKs have changed and this is expected due to your modifications, update the stored VKs:

```bash
barretenberg/cpp/scripts/chonk_inputs.sh update
```

### Verifying VK validity (proving the updated inputs)

Proving the pinned inputs is handled by tests, not by `chonk_inputs.sh`. To verify the C++ pinned input path locally, run:

```bash
barretenberg/cpp/scripts/chonk_inputs.sh download
barretenberg/cpp/scripts/run_test.sh bbapi_tests ChonkPinnedIvcInputsTest.AllPinnedFlows
```

For bb.js, run:

```bash
barretenberg/cpp/scripts/chonk_inputs.sh download
barretenberg/ts/scripts/run_test.sh bbapi/chonk_pinned_inputs.test.js
```

Typical workflow

1. Make barretenberg changes
2. Build native code: `cd barretenberg/cpp && ./bootstrap.sh build_native`
3. Check VKs: `barretenberg/cpp/scripts/chonk_inputs.sh check`
4. If VKs changed intentionally: `barretenberg/cpp/scripts/chonk_inputs.sh update`

## Example IVC inputs

Example IVC inputs (msgpack files) for `bb prove --scheme chonk` are pinned to a fixed CI tarball. Download them from the repo root with:

```bash
barretenberg/cpp/scripts/chonk_inputs.sh download
```

This creates `barretenberg/cpp/chonk-pinned-flows/<flow>/ivc-inputs.msgpack`. To intentionally refresh the pinned tarball, use the PR `ci-refresh-chonk` label or put `--ci-refresh-chonk` in the head commit message.

## Memory profiling

The `--memory_profile_out <file>` flag on `bb prove` outputs a JSON array of RSS checkpoints at key proving stages (after alloc, trace, oink, sumcheck, accumulate) for each circuit, with circuit names and indices.

```bash
cd barretenberg/cpp
./build/bin/bb prove \
  --scheme chonk \
  --ivc_inputs_path <path-to>/ivc-inputs.msgpack \
  -o /tmp/proof-out \
  -v \
  --memory_profile_out /tmp/proof-out/memory_profile.json
```

For a visual timeline of a single run, pipe verbose output to `plot_memory.py`:

```bash
bb prove --scheme chonk ... -v 2>&1 | python3 scripts/plot_memory.py > memory.html
```

The extraction script converts the JSON into dashboard benchmark entries (one overlaid line per circuit stage, tracked across commits):

```bash
echo '[]' > /tmp/proof-out/benchmarks.bench.json
python3 scripts/extract_memory_benchmarks.py /tmp/proof-out "app-proving/flow/native"
```

In CI, this is integrated into `ci_benchmark_ivc_flows.sh` (native only) and uploaded to the benchmark dashboard.
