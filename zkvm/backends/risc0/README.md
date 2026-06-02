# RISC Zero Backend

RISC Zero v3.x — the most mature RISC-V zkVM. Key differentiator: native
circuit-level SHA-256 acceleration (SHA-256 compress is a syscall, not software).

## Modes

| Mode | ID range | Hash | Expected perf |
|------|----------|------|---------------|
| SHA-256 precompile | 0..63 | Native SHA-256 circuit | Best — compare with SP1 SHA-256 |
| BN254 Poseidon2 | 64..127 | Software ark-bn254 on rv32im | Slow — 32-bit penalty |

SHA-256 mode is the interesting benchmark. BN254 mode gives apples-to-apples
comparison with Nexus/Jolt software Poseidon2.

## Prerequisites

```bash
# Install rzup (RISC Zero toolchain installer)
curl -L https://risczero.com/install | bash
source ~/.zshrc  # or restart shell

# Install the toolchain (compiler, r0vm, etc.)
rzup install
```

## Build & Run

```bash
cd zkvm/backends/risc0

# Build everything (methods crate compiles guest via risc0-build)
cargo build --release

# Run benchmarks (execute + prove + verify)
cargo run --release
```

## Architecture

- **ISA:** rv32im (RISC-V 32-bit, integer + multiplication)
- **Proof system:** STARK (BabyBear + Poseidon2) → recursive composition → optional Groth16 wrapping
- **SHA-256 precompile:** Native circuit support via patched `sha2` crate
- **Keccak precompile:** Coprocessor circuit (separate, composed via proof composition)
- **BN254 bigint2 accelerator:** Available for EC ops (not yet wired up)

## File structure

```
host/           Host: execute, prove, verify, timing
methods/        Build crate: risc0-build compiles guest at build time
  guest/        Guest binary: reads workload ID, runs shared runner, commits output
    src/
      main.rs                  Entry point with mode switch
      sha256_precompiles.rs    SHA-256 mode (native precompile)
      crypto/                  BN254 mode (software Poseidon2)
```
