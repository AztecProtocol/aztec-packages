# ACIR Tests

- Copies test programs from Noir (in `acir_tests/`) and compiles them
- The scripts/ folder assists bootstrap.sh in defining test scenarios involving compiled private Noir function artifacts (the bytecode being in ACIR format, hence the name of this module)
- The bootstrap.sh script is the source of truth for which proving modes are tested, e.g. solidity-friendly ultra honk uses --oracle_hash keccak.

## Quick Start

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
c5f89...:ISOLATE=1 scripts/bb_prove_sol_verify.sh assert_statement --disable_zk
c5f89...:ISOLATE=1 scripts/bb_prove_sol_verify.sh assert_statement
c5f89... scripts/bb_prove_bbjs_verify.sh assert_statement
c5f89... scripts/bb_prove.sh assert_statement
```

You can run any of these commands directly (ignore the hash prefix):
```bash
scripts/bb_prove.sh assert_statement
```

Programmatically, you can also do from root:

```bash
./barretenberg/acir_tests/bootstrap.sh test_cmds | grep assert_statement | ci3/parallelize
```
