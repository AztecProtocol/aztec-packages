# Nexus Backend (Stwo-backed)

RISC-V zkVM using Stwo as the proving backend. Stwo is the fastest STARK prover,
proven on 1420+ phone models (FibRace benchmark: 2.1M proofs, most <5s).

**Target**: `riscv32i-unknown-none-elf` (32-bit RISC-V, no multiply)
**Proof system**: Stwo (Circle STARKs by StarkWare)
**SDK**: `nexus-sdk` v0.3.6

## Prerequisites

### Install the Nexus CLI

**Installation requires nightly Rust** (build-time only). The CLI runs on stable.

```bash
# Install the specific nightly required for building cargo-nexus
rustup toolchain install nightly-2025-05-09

# Install cargo-nexus (takes ~60s)
rustup run nightly-2025-05-09 cargo install \
  --git https://github.com/nexus-xyz/nexus-zkvm cargo-nexus --tag 'v0.3.6'

# Add the RISC-V target
rustup target add riscv32i-unknown-none-elf
```

Verify:
```bash
cargo nexus --help
# Works on stable Rust despite nightly install requirement
```

**Quirk**: the docs say to use `rustup run nightly-2025-05-09 cargo nexus ...`
for ALL commands, but `cargo nexus` works fine on stable after installation.

### Scaffold a project

```bash
cargo nexus host nexus-host
```

**Quirk**: the scaffolding tool adds the project to the nearest parent Cargo
workspace. If that workspace doesn't define `workspace.package.edition`, the
scaffold fails. Fix: exclude the directory from the parent workspace, or add
`[workspace.package] edition = "2021"` to the generated Cargo.toml.

## Project structure

```
nexus-host/
  Cargo.toml          # Host (workspace root, includes guest)
  rust-toolchain.toml # Pins toolchain
  src/
    main.rs           # Host: compile, prove, verify
    guest/
      Cargo.toml      # Guest (workspace member)
      src/main.rs     # Guest: #[nexus_rt::main], read inputs, compute
```

## Building and running

```bash
cd backends/nexus/nexus-host

# Compile guest → RISC-V, prove, verify all workloads
cargo run --release
```

The `rust-toolchain.toml` in `nexus-host/` pins nightly-2025-05-09 and is picked
up automatically by cargo. No need to invoke cargo with `+nightly-*` manually.

The host program compiles the guest to RISC-V, proves with Stwo, and verifies.

## Why Nexus (Stwo)

- Stwo is the only prover proven at scale on phones (FibRace: 6047 players)
- ~1000x faster than Nexus v1/v2 (which used Nova/HyperNova)
- Circle STARK over M31 field (31-bit Mersenne prime)
- Poseidon2 precompile available over M31 (not BN254)

## Status

- CLI installed: YES
- Host compiles: YES
- Guest wired to shared runner (minimal, token_transfer, private_swap): YES
- Proof generation with Stwo: YES (tested, 3 workloads)
- Verify: YES
