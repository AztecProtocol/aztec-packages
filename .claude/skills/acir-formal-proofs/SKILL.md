---
name: acir-formal-proofs
description: Build and run ACIR formal proof tests with SMT verification. Generates ACIR artifacts from noir's ssa_verification tool, then runs each test individually with user-specified time/memory limits, and updates the README results table.
---

# ACIR Formal Proofs

Run the full ACIR formal verification pipeline: build tests, generate artifacts, and run each test with resource limits.

## Prerequisites

- CMake with `SMT=ON` and `ACIR_FORMAL_PROOFS=ON` flags
- Rust toolchain (for building ssa_verification)
- Sufficient RAM (some tests need >32GB)

## Steps

### Step 1: Build the acir_formal_proofs test binary

Configure cmake with SMT support and build:

```bash
cd barretenberg/cpp
cmake --preset smt-verification -DACIR_FORMAL_PROOFS=ON
cd build-smt && ninja acir_formal_proofs_tests
```

The preset `smt-verification` already sets `SMT=ON`. We additionally need `ACIR_FORMAL_PROOFS=ON`.

If the build has already been configured, just run `ninja acir_formal_proofs_tests` from `build-smt/`.

### Step 2: Fetch noir/noir-repo submodule (if needed)

Check if the submodule is populated:

```bash
ls noir/noir-repo/tooling/ssa_verification/Cargo.toml 2>/dev/null
```

If the file doesn't exist, initialize the submodule:

```bash
git submodule update --init --depth 1 noir/noir-repo
```

### Step 3: Build and run ssa_verification to generate ACIR artifacts

**ALWAYS run this step** — even if `.acir` files already exist in `/tmp/`. The artifacts must be regenerated every time to ensure they match the current noir compiler version.

```bash
cd noir/noir-repo
cargo run --release -p ssa_verification -- --dir /tmp/
```

This generates `.acir` files in `/tmp/` that the C++ tests load. The tool compiles Noir SSA instructions into ACIR format for each operation (add, sub, mul, div, etc.) with various type combinations.

### Step 4: Ask the user for resource limits

Before running tests, ask the user:

> What is the maximum **time** (in seconds) and **memory** (in GB) you'd like to allow per test?
> Some tests are very fast (<10s) while others can take hours or days. Known heavy tests:
>
> | Test | Typical time | Typical memory |
> |------|-------------|----------------|
> | uint_terms_shl32 | ~4574s | ~30GB |
> | uint_terms_shl8 | ~4574s | ~30GB |
> | uint_terms_shr | ~3928s | ~10GB |
> | uint_terms_xor | ~355s | - |
> | uint_terms_div | days | 20GB |
> | uint_terms_mod | >130 days | 3.2GB |
> | integer_terms_div | >17 days | 20GB |
> | non_uniqueness_for_truncate_field_to_u64 | hours | - |
>
> Suggested defaults: **600 seconds, 16 GB** (skips the heaviest tests)

Wait for the user to provide limits before proceeding.

### Step 5: Run each test individually with timeouts

Use the `run_tests.sh` script bundled with this skill. It runs all tests **sequentially** with the user's time/memory limits and writes results to `/tmp/acir_test_results.txt`.

```bash
.claude/skills/acir-formal-proofs/scripts/run_tests.sh ${TIME_LIMIT} ${MEM_LIMIT_GB}
```

For example, with 600s timeout and 16GB memory limit:
```bash
.claude/skills/acir-formal-proofs/scripts/run_tests.sh 600 16
```

The script handles timeout/OOM detection, wall-clock timing via `/usr/bin/time -v`, and prints a summary table at the end. Results are saved to `/tmp/acir_test_results.txt` in pipe-delimited format.

**CRITICAL:** Do NOT run tests any other way. Do NOT launch multiple tests in parallel — these tests are extremely memory- and CPU-intensive (some use >30GB RAM).

### Step 6: Update README.md results table

After all tests complete, update the results table in:
`barretenberg/cpp/src/barretenberg/acir_formal_proofs/README.md`

For each test that was run, update the corresponding row:
- **Time/seconds**: actual elapsed time (or "TIMEOUT" / "OOM" / "???" for failures)
- **Memory/GB**: peak RSS converted to GB (or the limit if OOM)
- **Success**: `&check;` if passed, `&cross;` if failed/timeout/OOM
- **Reason**: `-` if passed, otherwise "Test takes too long", "OOM", or the failure reason
- **Last Check (D/M/Y)**: today's date in DD.MM.YYYY format

The mapping from test name to README row is by opcode + types. For example:
- `uint_terms_add` -> `Binary::Add | Unsigned_128 | Unsigned_128`
- `field_terms_add` -> `Binary::Add | Field | Field`
- `SignedAdd` -> `Binary::Add | Signed_64 | Signed_64`
- `uint_terms_not` -> `Not | Unsigned_128 | -`
- `non_uniqueness_for_truncate_u64_to_u8` -> `Truncate | Unsigned_64 | Unsigned_8`

Do NOT modify rows for tests that were not run (e.g., if they timed out in a previous run and were skipped).

Add new rows if any tests exist in the test file but not in the README table.
