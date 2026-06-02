# Jolt Backend

Laptop-class zkVM using [a16z's Jolt](https://jolt.a16zcrypto.com/).
BN254-native field — Poseidon2 over BN254 is natural and efficient.

**Target**: `riscv64imac-unknown-none-elf` (64-bit RISC-V)
**Native field**: BN254 scalar field (254-bit)
**ZK**: BlindFold (native ZK via folding-based sumcheck)

## Prerequisites

### 1. Install Jolt CLI

```bash
cargo +nightly install --git https://github.com/a16z/jolt --force --bins jolt
```

### 2. Verify

```bash
jolt --version
```

## CRITICAL SETUP NOTES

This backend is a **self-contained workspace** (`backends/jolt/Cargo.toml`),
isolated from the parent `zkvm/` workspace. This is necessary because Jolt
uses a fork of arkworks (`a16z/arkworks-algebra`) that conflicts with
crates.io `ark-ff`.

The project structure was generated with `jolt new` and then modified.
**If recreating from scratch, always start from `jolt new`, then add deps.**
Do not try to wire up Jolt manually — the `jolt build` command has specific
expectations about project structure, `rust-toolchain.toml`, and workspace
layout.

The `rust-toolchain.toml` in this directory pins Rust 1.94 and includes
the RISC-V targets required by Jolt.

## Building and running

```bash
cd backends/jolt

# Run all workloads (compile + preprocess + prove + verify for all workloads)
RUST_LOG=info cargo run --release

# Prove + verify minimal workload only (via test)
cargo test --release -- jolt_prove_minimal --nocapture

# Prove + verify all workloads (via test)
cargo test --release -- jolt_prove_all_workloads --nocapture
```

**Note**: `cargo test --release` runs a full prove+verify cycle (not just compilation).
Jolt preprocessing is expensive — expect ~5-20 minutes for a full test run.
The `cargo run --release` path (main.rs) is faster for benchmarking multiple workloads
in sequence because it amortizes the preprocessing cost.

## Proving results (XOR stub hashing — not real Poseidon2 yet)

| Workload | Cycles | Padded Trace | Proving | Verify |
|----------|--------|-------------|---------|--------|
| minimal | 43,173 | 65,536 | 3,910ms | 130ms |
| token_transfer | 98,844 | 131,072 | 4,154ms | 143ms |
| private_swap | 130,013 | 131,072 | 4,381ms | 136ms |
| heavy | 337,565 | 524,288 | 5,371ms | 138ms |
| kernel_heavy | 381,449 | 524,288 | 5,420ms | 145ms |

These are **actual proofs with verification**, not just execution.
Proving throughput: ~30-73 kHz depending on trace utilization.
Note: these use XOR stub hashing. Real Poseidon2 will be more cycles
but should still benefit from BN254-native field arithmetic.

## How it works

**Guest** (`guest/src/lib.rs`):
- `#[jolt::provable]` macro on `process_workload(workload_id: u8)`
- Calls the shared runner: `run_workload_end_to_end::<NativePrecompiles>(workload)`
- Returns serialized `KernelPublicInputs`

**Host** (`src/main.rs` + `src/lib.rs`):
- `compile_process_workload(target_dir)` — builds guest ELF via `jolt build`
- `preprocess_shared_*` / `preprocess_prover_*` — one-time preprocessing
- `build_prover_*` — creates a closure that proves any input
- `build_verifier_*` — creates a closure that verifies any proof

## Key files

| File | Purpose |
|------|---------|
| `Cargo.toml` | Workspace root with `[patch.crates-io]` for Jolt's ark fork |
| `rust-toolchain.toml` | Pins Rust 1.94 + RISC-V targets (from `jolt new`) |
| `guest/src/lib.rs` | Guest function with `#[jolt::provable]` |
| `src/main.rs` | Host — runs all workloads |
| `src/lib.rs` | Library — `prove_workload()` for programmatic use |
