succint aztec-packages cheat sheet.

THE PROJECT ROOT IS AT TWO LEVELS ABOVE THIS FOLDER. Typically, the repository is at ~/aztec-packages. all advice is from the root.

Run ./bootstrap.sh at the top-level to be sure the repo fully builds.
Bootstrap scripts can be called with relative paths e.g. ../barretenberg/bootstrap.sh
You can use DISABLE_AVM=1 to bootstrap things generally.

# Working on modules:

## barretenberg/
The core proving system library. Focus development is in barretenberg/cpp.

### cpp/ => cpp code for prover library
Bootstrap modes:
- `./bootstrap.sh` => full build, needed for other components
- `./bootstrap.sh build` => standard build
- `DISABLE_AVM=1 ./bootstrap.sh build_native` => quick build without AVM. Good for verifying compilation works. Needed to build ts/
Development commands:
- cmake --preset build-no-avm
  cd build-no-avm
  ninja <test>
    NOTE: DO NOT add the -j flag, default is optimal.
    where test is based on what you're working on:
    - `./bin/ultra_honk_tests` - Ultra Honk circuit tests
    - `./bin/client_ivc_tests` - Client IVC tests
    - `./bin/api_tests` - API/CLI tests
    - `./bin/stdlib_*_tests` - Standard library tests
    - `./bin/crypto_*_tests` - Cryptographic primitive tests

### Barretenberg module components:
- **commitment_schemes/** - Polynomial commitment schemes (KZG, IPA)
- **crypto/** - Cryptographic primitives (hashes, merkle trees, fields)
- **ecc/** - Elliptic curve operations
- **flavor/** - Circuit proving system flavors (Ultra, Mega)
- **honk/** - The Honk proving system implementation
- **stdlib/** - Circuit-friendly implementations of primitives
- **ultra_honk/** - Ultra Honk prover/verifier
- **client_ivc/** - Client-side IVC (Incremental Verifiable Computation)
- **vm2/** - AVM implementation (not enabled, but might need to be fixed for compilation issues in root ./bootstrap.sh)
- **bbapi/** - BB API for external interaction. If changing here, we will also want to update the ts/ folder because bb.js consumes this. (first build ninja bb in build/)
- **dsl/** - ACIR definition in C++. This is dictated by the serialization in noir/, so refactor should generally not change the structure without confirming that the user is changing noir.

### ts/ => typescript code for bb.js
Bootstrap modes:
- `./bootstrap.sh` => generate TypeScript bindings and build. See package.json for more fine-grained commands.
Other commands:
- `yarn build:esm` => the quickest way to rebuild, if only changes inside ts/ folder, and only testing yarn-project.

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
```bash
# Run specific e2e tests
yarn-project/end-to-end/scripts/run_test.sh simple e2e_block_building
# To run this you CANNOT USE DISABLE_AVM=1. Only run this if the user asks (e.g. 'run the prover full test') You first need to confirm with the user that they want to build without AVM.
yarn-project/end-to-end/scripts/run_test.sh simple e2e_prover/full

### yarn-project IVC integration tests
Run IVC (Incremental Verifiable Computation) integration tests from the root:
```bash
# Run specific IVC tests
yarn-project/scripts/run_test.sh ivc-integration/src/native_client_ivc_integration.test.ts
yarn-project/scripts/run_test.sh ivc-integration/src/wasm_client_ivc_integration.test.ts
yarn-project/scripts/run_test.sh ivc-integration/src/browser_client_ivc_integration.test.ts

# Run rollup IVC tests (with verbose logging)
BB_VERBOSE=1 yarn-project/scripts/run_test.sh ivc-integration/src/rollup_ivc_integration.test.ts
```

When making barretenberg changes, ensure these tests still pass.
