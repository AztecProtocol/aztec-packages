# barretenberg/cpp

The core proving system library.

Bootstrap modes:

- `./bootstrap.sh` => full build, needed for other components
- `./bootstrap.sh build` => standard build
- `AVM=0 ./bootstrap.sh build_native` => quick build without slow bb-avm target. Good for verifying compilation works. Needed to build ts/

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

## Proof Size Constants

When making changes that affect proof sizes (e.g., pairing points encoding, public inputs structure), you must update constants in multiple places:

1. **C++ static_asserts** in `dsl/acir_format/mock_verifier_inputs.test.cpp` - These catch size changes at compile time
2. **Noir constants** in `noir-projects/noir-protocol-circuits/crates/types/src/constants.nr`
3. **TypeScript constants** - Run `yarn remake-constants` from `yarn-project/constants` to regenerate

Key constants to watch:
- `RECURSIVE_PROOF_LENGTH` - UltraHonk proof + DefaultIO public inputs
- `CHONK_PROOF_LENGTH` - ChonkProof + HidingKernelIO public inputs
- `PAIRING_POINTS_SIZE` - Size of pairing points in public inputs
- `HIDING_KERNEL_PUBLIC_INPUTS_SIZE` - Size of HidingKernelIO

If C++ static_asserts fail after your changes, update both the assert values AND the corresponding Noir constants, then run `yarn remake-constants`.

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
cd barretenberg/cpp/scripts
./test_chonk_standalone_vks_havent_changed.sh
```

Expected result: Script exits successfully if VKs are unchanged, or shows that VKs have changed.

### Updating VKs (when changes are intentional)

**IMPORTANT**: Never update the VKs without asking permission first. When asking for permission, explain why you think the VK update is to be expected.

If VKs have changed and this is expected due to your modifications, update the stored VKs:

```bash
cd barretenberg/cpp/scripts
./test_chonk_standalone_vks_havent_changed.sh --update_inputs
```

### Verifying VK validity (proving the updated inputs)

**IMPORTANT**: There is no need to verify the validity of the inputs after having updated them. The flag `update_inputs` verifies the new inputs.

To verify the validity of the inputs pinned by the script `./test_chonk_standalone_vks_havent_changed.sh`, run:

```bash
cd barretenberg/cpp/scripts
./test_chonk_standalone_vks_havent_changed.sh --prove_and_verify
```

Note: If a proof test fails for a specific flow, the inputs are saved to:
`yarn-project/end-to-end/example-app-ivc-inputs-out/<flow_name>`

Typical workflow

1. Make barretenberg changes
2. Build native code: `cd barretenberg/cpp && ./bootstrap.sh build_native`
3. Check VKs: `cd scripts && ./test_chonk_standalone_vks_havent_changed.sh`
4. If VKs changed intentionally: `./test_chonk_standalone_vks_havent_changed.sh --update_inputs`
