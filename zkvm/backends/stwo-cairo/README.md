# Stwo/Cairo Backend

Direct Cairo → Stwo proving. Uses Cairo's **native Poseidon2 builtin** which
runs as a dedicated AIR column — not software RISC-V instructions. This is
the theoretical best-case hash performance for Stwo.

**Language**: Cairo (Rust-like syntax, not Rust)
**Proof system**: Circle STARK (Stwo)
**Hash**: Poseidon2 over Stark252 field (native builtin)

## Prerequisites

```bash
# Install Cairo/Scarb toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.starkup.dev | sh
# Requires asdf-vm. If not installed, the script will prompt.

scarb --version
# Should show: scarb 2.16.1, cairo 2.16.1
```

## Building and running

```bash
cd backends/stwo-cairo

# Build
scarb build

# Execute (no proof) — output goes to target/execute/aztec_bench/executionN/
scarb execute

# Prove with Stwo (execute + generate proof in one step)
# Output: target/execute/aztec_bench/executionN/proof/proof.json
scarb prove --execute

# Verify — use the path from the most recent executionN run
# Each run creates a new numbered directory (execution1, execution2, ...)
scarb verify target/execute/aztec_bench/execution1/proof/proof.json
```

**Note on verify path**: `scarb execute` and `scarb prove --execute` increment
the execution directory counter each run. Check which `executionN` directory
was created and adjust the verify path accordingly.

**Performance tip**: for best prover speed, compile scarb-prove from source:
```bash
RUSTFLAGS="-C target-cpu=native -C opt-level=3" cargo install scarb-prove
```

## Architecture difference

Unlike RISC-V backends (SP1, Jolt, Nexus), Cairo programs don't compile
to a general-purpose ISA. Cairo compiles to Sierra → CASM (Cairo Assembly),
which runs on a specialized VM with built-in support for:
- Poseidon2 hash (dedicated AIR column — ~zero marginal proving cost)
- Range checks
- EC operations
- Felt252 field arithmetic (native)

This means Poseidon2 on Stwo/Cairo is NOT comparable to "software Poseidon2
on RISC-V + Stwo prover" (which is what Nexus does). The Cairo path exercises
Stwo's full potential for hash-heavy workloads.

## Limitations

- Our shared Rust kernel logic cannot be reused — must be rewritten in Cairo
- Only minimal workload (6 hashes) implemented so far
- Full token_transfer/private_swap would require significant Cairo porting
- No Merkle proof verification yet (would need 42-hash loop in Cairo)

## Status

- Build: YES
- Execute: YES
- Prove with Stwo: YES (~11.5s wall-clock for the minimal workload)
- Verify: YES
