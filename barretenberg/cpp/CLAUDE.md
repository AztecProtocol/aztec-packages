succint aztec-packages cheat sheet.

THE PROJECT ROOT IS AT TWO LEVELS ABOVE THIS FOLDER. Typically, the repository is at ~/aztec-packages. all advice is from the root.

# Git workflow for barretenberg

**IMPORTANT**: When comparing branches or looking at diffs for barretenberg work, use `merge-train/barretenberg` as the base branch, NOT `master`. The master branch is often outdated for barretenberg development.

Examples:
- `git diff merge-train/barretenberg...HEAD` (not `git diff master...HEAD`)
- `git log merge-train/barretenberg..HEAD` (not `git log master..HEAD`)

Run ./bootstrap.sh at the top-level to be sure the repo fully builds.
Bootstrap scripts can be called with relative paths e.g. ../barretenberg/bootstrap.sh

# Working on modules:

## barretenberg/

The core proving system library. Focus development is in barretenberg/cpp.

### cpp/ => cpp code for prover library

Bootstrap modes:

- `./bootstrap.sh` => full build, needed for other components
- `./bootstrap.sh build` => standard build
- `AVM=0 ./bootstrap.sh build_native` => quick build without slow bb-avm target. Good for verifying compilation works. Needed to build ts/
  Development commands:
- cmake --preset build
  cd build
  ninja <test>
  NOTE: DO NOT add the -j flag, default is optimal.
  where test is based on what you're working on:
  - `ultra_honk_tests` - Ultra Honk circuit tests
  - `chonk_tests` - Chonk tests
  - `dsl_tests` - ACIR/DSL tests (acir_format/, mock_verifier_inputs)
  - `hypernova_tests` - HyperNova folding tests
  - `eccvm_tests` - ECCVM circuit tests
  - `translator_vm_tests` - Translator circuit tests
  - `goblin_tests` - Goblin tests
  - `stdlib_*_tests` - Standard library tests
  - `crypto_*_tests` - Cryptographic primitive tests

  To find test targets: `ninja -t targets | grep "_tests:" | grep -v cmake`

### Barretenberg module components:

- **commitment_schemes/** - Polynomial commitment schemes (KZG, IPA)
- **crypto/** - Cryptographic primitives (hashes, merkle trees, fields)
- **ecc/** - Elliptic curve operations
- **flavor/** - Circuit proving system flavors (Ultra, Mega)
- **honk/** - The Honk proving system implementation
- **stdlib/** - Circuit-friendly implementations of primitives
- **ultra_honk/** - Ultra Honk prover/verifier
- **chonk/** - Client-side IVC (Incremental Verifiable Computation)
- **vm2/** - AVM implementation (not enabled, but might need to be fixed for compilation issues in root ./bootstrap.sh)
- **bbapi/** - BB API for external interaction. If changing here, we will also want to update the ts/ folder because bb.js consumes this. (first build ninja bb in build/)
- **dsl/** - ACIR definition in C++. This is dictated by the serialization in noir/, so refactor should generally not change the structure without confirming that the user is changing noir.

### ts/ => typescript code for bb.js

Bootstrap modes:

- `./bootstrap.sh` => generate TypeScript bindings and build. See package.json for more fine-grained commands.
  Other commands:
- `yarn build:esm` => the quickest way to rebuild, if only changes inside ts/ folder, and only testing yarn-project.
- `BUILD_CPP=1 scripts/copy_native.sh` => Ensures required cpp code is build (bb and nodejs_module) and copies into expected location.

## noir/

### noir-repo/ => clone of noir programming language git repo

Bootstrap modes:

- `./bootstrap.sh` => standard build

## avm-transpiler:

Transpiles Noir to AVM bytecode
Bootstrap modes:

- `./bootstrap.sh` => standard build

## Integration testing:

The focus is on barretenberg/cpp development. Other components need to work with barretenberg changes:

### yarn-project/end-to-end - E2E tests that verify the full stack

Run end-to-end tests from the root directory:

````bash
# Run specific e2e tests
yarn-project/end-to-end/scripts/run_test.sh simple e2e_block_building
# To run this you CANNOT USE DISABLE_AVM=1. Only run this if the user asks (e.g. 'run the prover full test') You first need to confirm with the user that they want to build without AVM.
yarn-project/end-to-end/scripts/run_test.sh simple e2e_prover/full

### yarn-project IVC integration tests
Run IVC (Incremental Verifiable Computation) integration tests from the root:
```bash
# Run specific IVC tests
yarn-project/scripts/run_test.sh ivc-integration/src/native_chonk_integration.test.ts
yarn-project/scripts/run_test.sh ivc-integration/src/wasm_chonk_integration.test.ts
yarn-project/scripts/run_test.sh ivc-integration/src/browser_chonk_integration.test.ts

# Run rollup IVC tests (with verbose logging)
BB_VERBOSE=1 yarn-project/scripts/run_test.sh ivc-integration/src/rollup_ivc_integration.test.ts
````

When making barretenberg changes, ensure these tests still pass.

## Benchmarking:

**IMPORTANT**: In the barretenberg context, "bench" or "benchmark" almost always means running `benchmark_remote.sh` for the given target on a remote benchmarking machine.

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

## Verification Keys

To check whether vks have changed first build barretenberg native code:

```bash
cd barretenberg/cpp
./bootstrap.sh build_native
```
and then run:
```bash
cd barretenberg/cpp/scripts
./test_chonk_standalone_vks_havent_changed.sh
```

If the vks have changed, you can update them using the script `./test_chonk_standalone_vks_havent_changed.sh ` with one of the following flags:
- `--update_fast`, this flag updates the vks without regenerating the msgpack inputs
- `--update_inputs`, this flag updates the vks and the msgpack inputs

Both flags run proof test on the msgpack inputs to ensure that we can prove with the new vks. In case a proof test fails, the inputs for which proving has failed are saved to `yarn-project/end-to-end/xample-app-ivc-inputs-out` under a folder with name equal to the flow for which the proof test failed.
