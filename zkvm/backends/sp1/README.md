# SP1 Backend

Server-side zkVM backend using [Succinct's SP1](https://docs.succinct.xyz/) v6.1.0.
Establishes the performance ceiling — SP1 is optimized for server proving
(10+ GB RAM) with precompile-accelerated cryptography.

**Target**: `riscv64im-succinct-zkvm-elf` (SP1's custom 64-bit RISC-V target)
**Native field**: BabyBear/KoalaBear (31-bit)
**SDK**: `sp1-sdk` v6.1.0 with `blocking` feature (sync API)

## Prerequisites

### 1. Install SP1 toolchain

```bash
curl -L https://sp1.succinct.xyz | bash
sp1up
```

This installs `cargo-prove` and the SP1 RISC-V Rust toolchain into `~/.sp1/bin/`.
You may need to add it to your PATH: `export PATH="$HOME/.sp1/bin:$PATH"`.

**Quirk**: `sp1up` installs its own Rust toolchain (`succinct`) which is separate
from your system Rust. The guest compiles with this toolchain automatically via
`cargo prove build`. The host uses your normal system Rust.

**Quirk**: the `sp1-sdk` host crate requires `protoc` (protobuf compiler) at
build time. Without it, you get: `Could not find protoc`.

### 2. Install protoc (required by sp1-sdk)

```bash
# Debian/Ubuntu
sudo apt-get install protobuf-compiler

# macOS
brew install protobuf
```

### 3. Verify installation

```bash
cargo prove --version
# Should print: cargo-prove sp1 (...)
protoc --version
```

## Building

### Guest binary (the program proven by SP1)

The guest crate is **not** part of the Cargo workspace — it compiles with SP1's
custom RISC-V toolchain. Build it separately:

```bash
cd backends/sp1/guest
cargo prove build
```

The ELF is output at:
`target/elf-compilation/riscv64im-succinct-zkvm-elf/release/zkvm-sp1-guest`

The host crate `include_bytes!()` this ELF at compile time, so the guest must
be built before the host can compile.

### Host crate

```bash
# From zkvm/ root
cargo build -p zkvm-sp1-host
```

## Running

All commands run from the `zkvm/` workspace root (where the top-level `Cargo.toml` lives).

### Execute without proof (cycle counting)

```bash
# Minimal workload — fast smoke test (~90s first-run init, then <1s)
cargo test -p zkvm-sp1-host --release -- sp1_execute_minimal --nocapture

# All key workloads (minimal, token_transfer, private_swap) — execute only
cargo test -p zkvm-sp1-host --release -- sp1_compare_poseidon2_vs_sha256 --nocapture
```

### Prove and verify

```bash
# Prove + verify minimal workload (Poseidon2 via Fp precompile)
cargo test -p zkvm-sp1-host --release -- sp1_prove_minimal --nocapture

# Prove + verify all key workloads
cargo test -p zkvm-sp1-host --release -- sp1_prove_key_workloads --nocapture

# Prove + verify in SHA-256 mode (for comparison)
cargo test -p zkvm-sp1-host --release -- sp1_prove_sha256_key_workloads --nocapture

# Prove + verify in native Poseidon2 mode
cargo test -p zkvm-sp1-host --release -- sp1_prove_native_poseidon2 --nocapture
```

### Run all tests

```bash
cargo test -p zkvm-sp1-host --release -- --nocapture
```

**Important: first-run setup overhead.** The first SP1 execution in a process
takes ~90 seconds for one-time initialization: loading prover parameters,
JIT-compiling the guest ELF, and warming up internal caches. This is amortized
across all subsequent executions in the same process — after setup, each
workload execution takes only 180-250ms.

If you're running tests, the 90s setup happens once per test binary invocation.
Running multiple workloads in a single test is faster than running them as
separate tests.

## Cycle count results (Phase 2)

Initial results with statically compiled test contracts (no WASM interpreter):

| Workload | Cycles | Execution Time |
|----------|--------|---------------|
| minimal | 61,225 | 183ms |
| token_transfer | 74,673 | 186ms |
| multi_hop | 61,227 | 184ms |
| heavy | 253,895 | 253ms |
| kernel_heavy | 157,738 | 211ms |

These are execute-only (no proof generated). Cycle counts are the primary
metric — they determine proving time regardless of hardware.

## How it works

**Guest** (`guest/src/main.rs`):
1. Reads workload parameters from SP1's input stream (`sp1_zkvm::io::read`)
2. Runs the selected test contract (statically compiled Rust, no interpreter)
3. Collects side effects and runs kernel verification (`verify_and_assemble`)
4. Commits serialized `KernelPublicInputs` as public output (`sp1_zkvm::io::commit_slice`)

**Host** (`host/src/lib.rs`):
1. Creates a `CpuProver` via `ProverClient::builder().cpu().build()`
2. Serializes workload parameters into `SP1Stdin`
3. Calls `client.execute(Elf::Static(ELF), stdin).run()` for cycle counting
4. Uses the blocking SDK API (`sp1_sdk::blocking`)

## Key files

| File | Purpose |
|------|---------|
| `guest/Cargo.toml` | Guest deps (sp1-zkvm 6.1.0, shared crates) |
| `guest/src/main.rs` | Guest entrypoint — test contract dispatch + kernel logic |
| `host/Cargo.toml` | Host deps (sp1-sdk 6.1.0 with blocking feature) |
| `host/src/lib.rs` | CpuProver setup, execute_only(), BenchmarkableBackend impl |

## Notes

- SP1 v6.1.0 uses `riscv64im-succinct-zkvm-elf` (64-bit RISC-V)
- The guest binary is the same for all transactions — contract bytecode will be
  dynamic data loaded from the bundle (in Phase 5 with the WASM interpreter)
- SP1 requires ~10 GB RAM for full proving; execute-only mode needs ~2 GB
- The SP1 SDK's blocking API (`sp1_sdk::blocking`) is used instead of the
  async API to keep the benchmark harness simple
- Poseidon2 is not exposed as a guest precompile in SP1 v6 — SHA-256 and
  Keccak-256 are available as precompiles
