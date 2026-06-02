# OpenVM Backend

Modular RISC-V zkVM with custom extension support (EC ops, modular arithmetic,
pairing, SHA-256, Keccak). Built by Axiom.

**Target**: RV32IM
**Proof system**: Plonky3 STARK
**Extensions**: Keccak, SHA-256, Big Integer, Modular Arithmetic, EC ops, Pairing, STARK verify

## Prerequisites

### Install the OpenVM CLI

**IMPORTANT**: OpenVM's CLI requires Rust 1.90.0 specifically, and the `--locked`
flag is mandatory. The repo's `rust-toolchain.toml` pins 1.90.0, and the
`Cargo.lock` pins deps that are compatible with it. Without `--locked`, the
foundry-common transitive dependency fails to compile.

```bash
rustup install 1.90.0
cargo +1.90.0 install --locked --git https://github.com/openvm-org/openvm.git --tag v1.5.0 cargo-openvm
```

Verify:
```bash
cargo +1.90.0 openvm --version
# Should print: cargo-openvm v1.5.0 (...)
```

**Note**: the guest code itself compiles fine on stable Rust 1.94. Only the CLI
tool (`cargo openvm build`, `cargo openvm prove`) needs Rust 1.90.0.

### If the install fails

The most common failure is `foundry-common` compilation errors. The fix:
1. Ensure you're using `+1.90.0` (not stable, not nightly)
2. Ensure `--locked` is present (uses the repo's Cargo.lock)
3. If still failing, try without the EVM feature:
   ```bash
   cargo +1.90.0 install --locked --git https://github.com/openvm-org/openvm.git \
     --tag v1.5.0 --no-default-features --features parallel,jemalloc,metrics cargo-openvm
   ```

## Building

```bash
cd backends/openvm/aztec-test

# Build guest (transpiles Rust → RV32IM → OpenVM format)
cargo +1.90.0 openvm build

# Output: target/openvm/release/aztec-test.vmexe
```

## Running

All commands must be run from `backends/openvm/aztec-test/` (where `openvm.toml` lives).

```bash
# Execute without proof (for testing)
# Input format: 0x01 (byte-stream prefix) + OpenVM-serde-serialized workload_id
# u8 serializes as u32 LE, so workload_id=2 (PrivateSwap) = 0x0102000000
cargo +1.90.0 openvm run --input "0x0102000000"

# Generate proving key (required before prove; takes ~1.8s)
cargo +1.90.0 openvm keygen

# Generate proof (keygen must be run first)
cargo +1.90.0 openvm prove app --input "0x0102000000"

# Verify proof
cargo +1.90.0 openvm verify app
```

### Workload IDs

| ID | Workload |
|----|----------|
| 0 | Minimal |
| 1 | TokenTransfer |
| 2 | PrivateSwap |

CLI input for workload N: `0x01` + 4 LE bytes of N. Examples:
- Minimal (0): `0x0100000000`
- TokenTransfer (1): `0x0101000000`
- PrivateSwap (2): `0x0102000000`

### Input encoding

OpenVM's `read::<u8>()` uses OpenVM's own serde format, which serializes
`u8` as a full `u32`. The CLI input is `0x01` (byte-stream mode) followed
by the serialized bytes. A `u8` value of N serializes as `[N, 0, 0, 0]`
in LE, so the CLI input for workload_id=N is `0x01` + 4 LE bytes.

## Extensions (openvm.toml)

OpenVM's killer feature: custom accelerated instructions configured via `openvm.toml`.
Available extensions include modular arithmetic (BN254 Fr/Fp), EC operations,
pairing. These could dramatically reduce Poseidon2/Grumpkin cycle counts.

See: https://docs.openvm.dev/book/writing-apps/overview/

## Code Reuse

As of 2026-04-11, the OpenVM guest uses the **shared runner** from
`zkvm-test-contracts`, the same as SP1 and Jolt. The `OpenVmPrecompiles`
struct in `src/openvm_precompiles.rs` bridges OpenVM's `Bn254Fr` (from
`moduli_declare!`) to the shared `Precompiles` trait with `NativeDigest`.

## Status

- Guest compiles and transpiles: YES
- Shared runner integration: YES (uses `runner::run_workload_end_to_end`)
- Execution (no proof): ~instant, returns 32-byte output array
- Keygen: ~1.8s
- Proof generation (PrivateSwap, shared runner): 60s wall-clock (~55 min CPU-equiv at 82x parallelism)
- Extensions configured: modular arithmetic (BN254 Fr), keccak, sha256

Note: this is a slower result than the earlier standalone OpenVM (10.5s) that
used a simpler/smaller workload. The shared runner PrivateSwap involves 107+
Poseidon2 hashes, Merkle proofs, and full context overhead.
