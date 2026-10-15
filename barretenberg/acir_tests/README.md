# ACIR Tests

- Copies test programs from Noir (in `acir_tests/`) and compiles them
- The scripts/ folder assists bootstrap.sh in defining test scenarios involving compiled Noir programs (ACIR bytecode, hence the name of this module): Noir's `test_programs/execution_success` plus `internal_test_programs/`
- The bootstrap.sh script is the source of truth for which proving modes are tested, e.g. solidity-friendly ultra honk uses --oracle_hash keccak.

## Quick Start

Prerequisites: a built `noir/noir-repo` (bootstrap copies `test_programs/execution_success` and compiles it with that nargo) and a built bb. The scripts find bb through `cpp/scripts/find-bb`, so they use `bb-avm` unless `AVM=0`. Bootstrap also uses the remote build cache.

```bash
# Build all the test programs
./bootstrap.sh

# Run all tests
./bootstrap.sh test
```

## Running Specific Tests

The easiest way to find how to run specific test(s):

```bash
# See all available test commands
./bootstrap.sh test_cmds

# Find a specific test
./bootstrap.sh test_cmds | grep assert_statement
```

This will show you the exact commands used in CI. For example:
```
c5f89...:ISOLATE=1 barretenberg/acir_tests/scripts/bb_prove_sol_verify.sh assert_statement --disable_zk
c5f89...:ISOLATE=1 USE_OPTIMIZED_CONTRACT=true barretenberg/acir_tests/scripts/bb_prove_sol_verify.sh assert_statement --disable_zk
c5f89... barretenberg/acir_tests/scripts/bb_prove.sh assert_statement
```

The list also has `bb_prove_bbjs_verify.sh` and `acir_roundtrip.sh` variants. You can run any of these commands directly from the repository root (ignore the hash prefix):
```bash
barretenberg/acir_tests/scripts/bb_prove.sh assert_statement
```

The program name must exist under `acir_tests/acir_tests/`, which the build creates.

Programmatically, you can also do from root:

```bash
./barretenberg/acir_tests/bootstrap.sh test_cmds | grep assert_statement | ci3/parallelize
```
