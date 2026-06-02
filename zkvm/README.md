# zkVM Client-Side Proving Spike

Exploring how to prove the execution of arbitrary private function call stacks
for Aztec on a phone. Replacing the recursive circuit composition
(init→inner→reset→tail kernel pipeline) with a single provable VM execution.

**This is a spike** — the goal is to measure and compare, not to ship.

See `zkvm-exploration-report.md` (repo root) for full architectural context
and `PLAN.md` for the strategic direction + implementation plan.

### Architectural status

The Phase 0–4 work benchmarks general-purpose zkVM backends by **statically
compiling** contract + kernel logic into a single binary. This measures the
crypto + kernel performance floor, but is NOT the target architecture. The real
system must dynamically interpret arbitrary private function bytecodes.

The most promising path for phone viability appears to be a **purpose-built
provable VM** (like Cairo VM or Miden VM) rather than interpreting bytecodes
inside a general-purpose RISC-V zkVM. Evidence: Cairo/Stwo is 4–13x faster
than any RISC-V backend, and RISC-V provers need 10–30 GB (not phone-viable).
However, RISC-V is not ruled out — Jolt's streaming prover (<2 GB) and
continuations may close the gap. Phase 5 will measure interpretation overhead
to inform the final architecture decision. See PLAN.md for the three options.

## Current benchmark results

All with real BN254 Poseidon2 and 42-deep Merkle proof verification.
"private_swap" is the realistic target: account entrypoint → FPC fee payment
(with authwit) → 2 token transfers → AMM public call.

| Backend | private_swap cycles | Proving time | Peak RAM | Verify |
|---------|--------------------:|-------------:|---------:|-------:|
| **SP1 (Fp precompile)** | 4.1M | 68s | TBD | 119ms |
| **SP1 (software)** | 29.7M | 145s | TBD | 346ms |
| **Jolt** | 32.7M | 70s | ~27 GB | 184ms |
| **OpenVM** | TBD | ~60s | TBD | TBD |
| **Cairo/Stwo** | ~6 hashes (minimal) | ~11.5s | TBD | TBD |

Target: prove a swap in <1 minute on a laptop. Currently ~60-68s on a server.
OpenVM and Cairo/Stwo numbers are standalone (not comparable — different workload sizes).

### What's NOT yet measured (will increase cycle counts)
- Signature verification (Schnorr on Grumpkin — EC scalar mul)
- ECDH for encryption key derivation
- AES-128 encryption of note logs

## Prerequisites

- **Rust stable** (1.82+): `rustup update stable`
- **WASM target**: `rustup target add wasm32-unknown-unknown`
- **Docker** (optional, for containerized benchmarking)

Backend-specific toolchains — see READMEs in `backends/sp1/`, `backends/jolt/`,
`backends/openvm/`, `backends/nexus/`, `backends/stwo-cairo/`.

## Quick start

```bash
cd zkvm

# Build and test shared crates (fast, no zkVM toolchain needed)
cargo test

# Verify no_std compliance
cargo check --target wasm32-unknown-unknown \
  -p zkvm-data-types -p zkvm-kernel-logic -p zkvm-aztec-sdk -p zkvm-test-contracts

# SP1: execute without proof (requires sp1up toolchain + protoc)
cargo test -p zkvm-sp1-host --release -- sp1_execute_minimal --nocapture

# SP1: full prove + verify
cargo test -p zkvm-sp1-host --release -- sp1_prove_key_workloads --nocapture

# Jolt: compile + preprocess + prove + verify all workloads (requires jolt CLI)
cd backends/jolt && RUST_LOG=info cargo run --release

# OpenVM: build + prove (requires cargo-openvm 1.5.0)
cd backends/openvm/aztec-test
cargo +1.90.0 openvm build && cargo +1.90.0 openvm keygen
cargo +1.90.0 openvm prove app --input "0x0102000000"

# Nexus: compile + prove + verify (requires cargo-nexus 0.3.6)
cd backends/nexus/nexus-host && cargo run --release

# Cairo/Stwo: execute + prove (requires scarb/starkup)
cd backends/stwo-cairo && scarb execute && scarb prove --execute
```

## Directory structure

```
shared/
  data-types/       Digest/Precompiles traits, protocol types, constants, domain separators
  crypto-bn254/     Real BN254 Poseidon2 (ported from bn254_blackbox_solver), Bn254Digest
  kernel-logic/     Silo, squash, Merkle verify, gas metering, kernel assembly
                    Also: INLINE_VS_BATCHED.md analysis
  aztec-sdk/        PrivateContext (per-function), TxExecutionContext (inline kernel)
  test-contracts/   Realistic workloads: minimal, token_transfer, private_swap, heavy
                    runner.rs (batched kernel), runner_inline.rs (inline kernel)
                    merkle_fixtures.rs (host-side witness generation)
  interpreter/      WASM bytecode interpreter (future)
  preflight/        Host-side execution + hint generation (future)
  benchmarks/       Benchmark harness, native baseline, result formatters

backends/
  sp1/              SP1 v6.1.0 — server-side, BN254 Fp precompile Poseidon2
    guest/          Guest binary with sp1_poseidon2.rs (precompile-accelerated)
    host/           CpuProver, execute + prove, RAM measurement
  jolt/             Jolt — BN254-native, self-contained workspace
    guest/          Guest with JoltPrecompiles (real Poseidon2 via Jolt's ark fork)
    src/            Host — compile, preprocess, prove, verify
  openvm/           OpenVM v1.5.0 — modular RISC-V, BN254 modular arithmetic extension
    aztec-test/     Guest + openvm.toml, built/run via cargo-openvm CLI
  nexus/            Nexus v0.3.6 — Stwo-backed RISC-V zkVM, phone-scale target
    nexus-host/     Host + guest workspace, prove + verify via nexus-sdk
  stwo-cairo/       Cairo/Stwo — native Poseidon2 builtin, not RISC-V
    src/            Cairo source (lib.cairo) — native Stark252 arithmetic
  zkwasm/           zkWASM — WASM-native (guest compiles to wasm32, proving WIP)
    guest/          WASM guest with zkmain() entry point
    prover/         Cloned zkWASM prover (not committed)
```

## Architecture: inline kernel processing

Kernel operations happen inline during execution, matching barretenberg's VM2:

```
For each private function call:
  emit_note_hash(value):
    → silo: H(contract_address, value)      [1 Poseidon2]
    → add to pending (may be squashed later)
    → meter gas

  emit_nullifier_for_note_hash(value, note_hash):
    → find matching note hash in pending → REMOVE both (squash!)
    → or: silo and add to output

  read_note_hash(leaf, witness):
    → hash from leaf to root                 [42 Poseidon2 compress]
    → check against tree root

  finalize():
    → uniquify remaining note hashes         [2 Poseidon2 each]
    → assemble KernelPublicInputs
```

No separate kernel pass, no hint structures, no second traversal.
See `shared/kernel-logic/INLINE_VS_BATCHED.md` for full analysis.

## Coding conventions

- `#![no_std]` + `extern crate alloc` for all shared crates
- `BTreeMap` not `HashMap`; `u32`/`u64` not `usize`
- `#[serde(bound = "")]` on generic structs
- Pure-Rust deps only
- All crypto via `Precompiles` trait — never hardcode a hash function
- Shared crates have ZERO crypto dependencies (all crypto in backend dirs)
- Test workloads compute real hashes (not pre-cooked values)

## Key findings

1. **Merkle proofs dominate**: 2 reads × 42-deep tree = 84 Poseidon2 compress
   = ~28M cycles on Jolt. This is 8x more than all other kernel operations combined.

2. **Jolt "BN254-native" doesn't reduce cycles**: the guest still runs multi-limb
   RISC-V instructions. "Native" only helps the prover's commitment scheme.

3. **SP1 Fp precompiles help 7-9x**: `syscall_bn254_fp_mulmod` reduces each
   field multiply from ~20 instructions to 1 syscall.

4. **Inline kernel = same cycles as batched**: when done correctly (host provides
   Merkle witnesses as hints, guest only hashes leaf-to-root).

5. **No zkVM has Aztec-compatible Poseidon2 precompile**: all Poseidon2 precompiles
   are over small fields (BabyBear/M31), not BN254 Fr.

6. **RAM usage is ~26 GB on Jolt**: far too high for client devices.
