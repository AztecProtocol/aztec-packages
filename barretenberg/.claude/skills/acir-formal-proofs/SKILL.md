---
name: acir-formal-proofs
description: Build and run ACIR formal proof tests with SMT verification. Generates ACIR artifacts from noir's ssa_verification tool, then runs each test individually with user-specified time/memory limits, and updates the README results table.
---

# ACIR Formal Proofs

Run the full ACIR formal verification pipeline: build tests, generate artifacts, and run each test with resource limits.

## Prerequisites

- CMake with `SMT=ON` and `ACIR_FORMAL_PROOFS=ON` flags; the `smt-verification` preset needs `clang-20` on PATH
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

The preset sets `SMT=ON`; add `-DACIR_FORMAL_PROOFS=ON`.

If the build has already been configured, just run `ninja acir_formal_proofs_tests` from `build-smt/`.

### Step 2: Get a noir checkout that still has ssa_verification

The `.acir` inputs come from noir's `ssa_verification` tool. noir removed that crate in commit `dc6a363547d`, so the pinned `noir/noir-repo` does not contain it. Check out the parent of that commit in a separate worktree (do not move the pinned submodule):

```bash
git -C noir/noir-repo fetch origin dc6a363547d544f638e6ea64ec0f5e6f22e01256   # only for a shallow clone; git fetch needs the full SHA
git -C noir/noir-repo worktree add /tmp/noir-ssa-verification dc6a363547d^
```

### Step 3: Build and run ssa_verification to generate ACIR artifacts

**ALWAYS run this step** — even if `.acir` files already exist in `/tmp/`. Stale artifacts may not match the current ACIR format.

```bash
cd /tmp/noir-ssa-verification
cargo run --release -p ssa_verification -- --dir /tmp/
```

This generates `.acir` files in `/tmp/` that the C++ tests load. The tool compiles Noir SSA instructions into ACIR format for each operation (add, sub, mul, div, etc.) with various type combinations. The artifacts come from an older noir than the one this repository pins; if a test fails to load an artifact, the ACIR serialization has changed since that commit.

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
barretenberg/.claude/skills/acir-formal-proofs/scripts/run_tests.sh ${TIME_LIMIT} ${MEM_LIMIT_GB}
```

For example, with 600s timeout and 16GB memory limit:
```bash
barretenberg/.claude/skills/acir-formal-proofs/scripts/run_tests.sh 600 16
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

Add new rows if any tests exist in the test file but not in the README table. `run_tests.sh` has a hard-coded `TESTS` list: when a test is added to `acir_loader.test.cpp`, add it there too.
