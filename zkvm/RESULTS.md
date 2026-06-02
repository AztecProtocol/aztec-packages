# zkVM Benchmark Results

All measurements taken 2026-04-11 on a shared server (RAM numbers may be inflated).
Workloads: realistic Aztec tx flows with FPC fee payment, authwits, 42-deep Merkle reads.

## Master comparison table (private_swap workload)

private_swap = account entrypoint → FPC fee payment (authwit) → 2 token transfers
(each with authwit + 42-deep Merkle read + nullifier + change note) → AMM public call.
~107 hash calls including 84 Merkle compress calls.

| # | Backend | Hash | Prove | Cycles | RAM | Verify | EC sig? |
|---|---------|------|------:|-------:|----:|-------:|---------|
| 1 | **Ligetron (full kernel)** | BN254 Poseidon2 + EdDSA BJJ + sponge enc (Ligero) | **4.9s** | N/A | **258MB** | TBD | **yes** |
| 2 | **Cairo/Stwo** | Native Poseidon2 builtin (Stark252) | **11.5s** | N/A | N/A | N/A | no |
| 3 | **RISC Zero SHA-256** | Native SHA-256 circuit | **39.8s** | 1.9M | ~9.4GB | 40ms | no |
| 4 | **SP1 SHA-256** | Dedicated precompile | **45.3s** | 1.9M | ~17GB | 121ms | no |
| 5 | **SP1 native Poseidon2** | syscall_poseidon2 (KoalaBear) | **59.1s** | 624K | ~12GB | 121ms | no |
| 6 | **OpenVM** | BN254 Fr Poseidon2 via modular arith extension | **60s** | N/A | N/A | N/A | no |
| 7 | **Jolt** | Software Poseidon2-BN254 | **67.8s** | 32.7M | ~27GB | 184ms | no |
| 8 | **SP1 Fp Poseidon2** | BN254 Fp mul/add syscalls | **69.6s** | 4.1M | ~26GB | 119ms | no |
| 9 | **Jolt (+ Schnorr)** | Software Poseidon2-BN254 + Grumpkin EC | **87s** | ~35M | ~31GB | 188ms | **yes** |
| 10 | **Nexus/Stwo Keccak** | Software Keccak256 (tiny-keccak) | **125s** | N/A | ~134GB | 779ms | no |
| 11 | **SP1 software** | Software Poseidon2-BN254 (ark-bn254) | **145.3s** | 29.7M | N/A | 346ms | no |
| 12 | **Nexus/Stwo BN254** | Software Poseidon2-BN254 (rv32) | **233s** min only | N/A | OOM | 2.5s | no |

**Target**: prove private_swap in <30s on a phone with <2 GB RAM.
**Best result**: Ligetron 4.9s / 258 MB (full kernel, real crypto, software Vulkan — no GPU).

**NOTE on Ligetron:** The table entry (2.7s/247MB) is hashes-only. The **full kernel logic** result
with real Poseidon2 + EdDSA (Baby JubJub) + Poseidon2 sponge encryption is **4.9s / 258 MB** (all
constraint validations pass). Runs on software Vulkan (lavapipe, no GPU) — a real GPU would be faster.
Ligetron natively interprets WASM bytecodes with per-opcode constraint generation, so no "statically
compiled shortcut." The proof system is Ligero (not STARK/SNARK) — proofs are sqrt(N) sized and would
need SNARK-wrapping for L1 verification.

---

## Hash function native performance vs in-circuit verification cost

This tradeoff matters for proof composition: a prover wants fast native hashing, but a
verifier circuit (for SNARK-wrapping) wants algebraic-friendly hashing.

### Native CPU execution speed

| Hash function | Native speed | vs SHA-256 (software) |
|---|---|---|
| SHA-256 (no HW accel) | ~300-400 ns/hash | 1x |
| SHA-256 (SHA-NI / Intel) | ~100 ns/hash | 3x faster |
| Poseidon2 over BabyBear/M31 (31-bit) | ~150-400 ns/hash | ~1-3x slower |
| Poseidon2 over Goldilocks (64-bit) | ~300-500 ns/hash | ~comparable |
| Poseidon2 over BN254 (256-bit) | ~4,000-5,000 ns/hash | **10-15x slower** |

### In-circuit verification cost (R1CS constraints per hash)

| Hash function | Constraints per hash | vs Poseidon2 |
|---|---|---|
| SHA-256 | ~25,000 | **~100x more expensive** |
| Poseidon2 (SNARK-friendly field) | ~250 | 1x baseline |

### Implications for Ligetron

Ligetron uses SHA-256 for its internal Merkle commitments (fast on GPU: 32-bit
rotations/additions). This is optimal for prover speed but creates a problem for
SNARK-wrapping: verifying ~192 SHA-256 Merkle paths in a circuit is ~100x more
expensive than if Poseidon2 were used. If Ligetron offered a Poseidon2 commitment
mode (over M31/BabyBear — nearly as fast natively as SHA-256), SNARK-wrapping
would be dramatically cheaper. This is worth raising with the Ligero team.

Sources: Poseidon2 paper (IACR 2023/323), Skyscraper-v2 (IACR 2025/058),
light-poseidon BN254 benchmarks, minio/sha256-simd SHA-NI benchmarks.

---

## Configuration matrix: what's tested and what's available

| Backend | ISA | Hash tested | Hash accel? | Shared runner? | EC sig tested | EC accel? |
|---------|-----|------------|-------------|:--------------:|---------------|-----------|
| **SP1 native Poseidon2** | rv64im | syscall_poseidon2 (KoalaBear) | YES (1 syscall/perm) | YES | no | BN254 Fp, secp256k1 available |
| **SP1 SHA-256** | rv64im | sha2 crate (routes to precompile) | YES (dedicated circuit) | YES | no | BN254 Fp, secp256k1 available |
| **SP1 Fp Poseidon2** | rv64im | Poseidon2 via Fp mul/add syscalls | Partial (field ops only) | YES | no | BN254 Fp available |
| **SP1 software** | rv64im | ark-bn254 Poseidon2 | No | YES | no | No |
| **Jolt** | rv64imac | ark-bn254 Poseidon2 (Jolt fork) | No | YES | Schnorr (Grumpkin) | Grumpkin div inlines |
| **OpenVM** | rv32im | BN254 Fr Poseidon2 via modular arith extension | YES (field ops) | YES | no | EC extension available |
| **Nexus/Stwo** | rv32im | Keccak (tiny-keccak) | No | YES | no | No |
| **Cairo/Stwo** | Cairo/CASM | Native Poseidon2 builtin | YES (dedicated AIR) | No (different language) | no | EC builtin available |

### What's NOT yet tested but available

| Backend | Available precompile | Expected impact |
|---------|---------------------|-----------------|
| SP1 | Keccak precompile | Unknown — test vs SHA-256 |
| Jolt | jolt-inlines-sha2 / keccak256 | Unknown — Jolt's acceleration mechanism |
| Jolt | jolt-inlines-grumpkin | Could accelerate Schnorr verification |
| OpenVM | EC extension for Grumpkin/secp256k1 | Could accelerate signatures |
| OpenVM | Keccak/SHA-256 extensions | Alternative hash choice |
| Cairo/Stwo | EC builtin for signatures | Would complete the Cairo workload |

### What CANNOT be done today

- **No zkVM has Poseidon2 over BN254 Fr as a dedicated precompile** — the protocol's current hash requires software BN254 or field-op acceleration
- **Nexus has no guest API for Poseidon2** — only Keccak precompile exists; no SHA-256; no BN254 Fr
- **No zkVM has AES precompile** — note encryption is always software
- **Jolt has zero hash precompiles** (planned, not shipped)
- **Software BN254 Poseidon2 on rv32 (Nexus) is not viable** — 32-bit penalty is ~28x vs 64-bit, OOM on realistic workloads

---

## Detailed results per backend

### SP1 v6.1.0

| Mode | Workload | Cycles | Prove | Verify | RAM | Hash |
|------|----------|-------:|------:|-------:|----:|------|
| Native Poseidon2 | minimal | 50K | 78s | 120ms | ~10GB | syscall_poseidon2 |
| Native Poseidon2 | token_transfer | 581K | 97s | 169ms | ~11GB | syscall_poseidon2 |
| Native Poseidon2 | private_swap | 624K | 59s | 121ms | ~12GB | syscall_poseidon2 |
| SHA-256 precompile | minimal | 62K | 32s | 119ms | ~10GB | sha2 crate |
| SHA-256 precompile | token_transfer | 1.8M | 44s | 122ms | ~15GB | sha2 crate |
| SHA-256 precompile | private_swap | 1.9M | 45s | 121ms | ~17GB | sha2 crate |
| Fp precompile Poseidon2 | minimal | 130K | 99s | 117ms | N/A | BN254 Fp syscalls |
| Fp precompile Poseidon2 | token_transfer | 3.9M | 69s | 119ms | ~23GB | BN254 Fp syscalls |
| Fp precompile Poseidon2 | private_swap | 4.1M | 70s | 119ms | ~26GB | BN254 Fp syscalls |
| Software BN254 | minimal | 1.2M | 42s | 119ms | N/A | ark-bn254 |
| Software BN254 | token_transfer | 28.7M | 131s | 321ms | N/A | ark-bn254 |
| Software BN254 | private_swap | 29.7M | 145s | 346ms | N/A | ark-bn254 |

### Jolt (BN254-native prover)

| Config | Workload | Actual Cycles | Padded | Prove | Verify | RAM |
|--------|----------|-------------:|-------:|------:|-------:|----:|
| Poseidon2 | minimal | 1.7M | 2.1M | 9.4s | 149ms | 6GB |
| Poseidon2 | token_transfer | 31.6M | 33.6M | 68s | 188ms | 26GB |
| Poseidon2 | private_swap | 32.7M | 33.6M | 68s | 184ms | 27GB |
| Poseidon2 + Schnorr | token_transfer | ~35M | 67.1M | 87s | 188ms | 31GB |

### Cairo/Stwo (native Poseidon2 builtin)

Standalone benchmark (hand-written Cairo — cannot use shared Rust runner).

| Workload | Hashes | Prove | Notes |
|----------|-------:|------:|-------|
| minimal | 6 | 10.5s | Prover overhead dominates |
| token_transfer | 101 | 11.2s | Hash count barely affects time |
| private_swap | 107 | 11.5s | ~6% more hashes = ~3% more time |

StarkWare claims 620K Poseidon2 hashes/sec on M3 laptop.
Our 107 hashes ≈ 0.17ms hash time. The 11.5s is prover overhead (FFT, FRI).

### OpenVM v1.5.0 (BN254 Fr modular arithmetic extension)

Uses shared `run_workload_end_to_end` runner — apples-to-apples with SP1 and Jolt.

| Workload | Prove | Notes |
|----------|------:|-------|
| private_swap | 60s | BN254 Fr field ops via modular arith extension |

Hash is Poseidon2 over BN254 Fr using OpenVM's modular arithmetic extension (field mul/add accelerated, not a dedicated Poseidon2 permutation circuit). EC extension available but not yet tested.

### RISC Zero v3.0.5 (native SHA-256 circuit, rv32im)

Uses shared `run_workload_end_to_end` runner — apples-to-apples with SP1, Jolt, OpenVM.
SHA-256 is RISC Zero's native hash — circuit-level acceleration via `sys_sha_compress` syscall.
The patched `sha2` crate routes all SHA-256 compress operations through the native circuit.

| Hash | Workload | Cycles | Prove | Verify | RAM |
|------|----------|-------:|------:|-------:|----:|
| SHA-256 (native) | minimal | 35K | 2.8s | 17ms | ~1.2GB |
| SHA-256 (native) | token_transfer | 1.8M | 41s | 39ms | ~9.4GB |
| SHA-256 (native) | private_swap | 1.9M | 40s | 40ms | ~9.4GB |

RISC Zero is the **fastest RISC-V backend** at 40s, beating SP1 SHA-256 (45s) with less
RAM (9.4 GB vs 17 GB). Cycle counts are nearly identical (1.9M vs 1.9M), suggesting
RISC Zero's prover is more efficient per cycle than SP1's for SHA-256 workloads.

### Nexus v0.3.6 (Stwo backend, riscv32im)

Keccak precompile exists but is the only hash option. No Poseidon2 guest API, no SHA-256.
**NOTE:** All numbers below are with SOFTWARE Keccak/Poseidon2 — the Keccak precompile
was NOT tested. The precompile numbers could be significantly better. TODO: re-benchmark
with the actual Keccak precompile for apples-to-apples comparison with RISC Zero SHA-256.

| Hash | Workload | Prove | Verify | RAM | Notes |
|------|----------|------:|-------:|----:|-------|
| Software Keccak | minimal | 8.4s | 66ms | ~6GB | |
| Software Keccak | token_transfer | 125s | 779ms | ~134GB | Software Keccak = disaster |
| Software BN254 Poseidon2 | minimal | 233s | 2.5s | ~79KB proof | 32-bit penalty ~28x vs Jolt |
| Software BN254 Poseidon2 | token_transfer | OOM killed | — | >134GB | Not viable |

---

## Key findings

1. **Cairo/Stwo is 4-13x faster than any RISC-V backend** for hash-heavy workloads.
   Native Poseidon2 builtin makes hash cost essentially free. 11.5s private_swap.

2. **SP1 SHA-256 precompile is the best RISC-V option** at 45s — counterintuitively
   faster than SP1's own native Poseidon2 precompile (59s) because SHA-256 circuit
   rows are cheaper to prove despite 3x more cycles.

3. **OpenVM matches SP1 native Poseidon2** at 60s using BN254 Fr field-op acceleration,
   but without a dedicated Poseidon2 permutation circuit. It's Rust, uses shared runner,
   and is a legitimate apples-to-apples result.

4. **The protocol's hash function choice is the #1 optimization lever.** Gap between
   native precompile (11.5-60s) and software BN254 Poseidon2 (68-145s) is 1.5-13x.

5. **No zkVM has a dedicated BN254 Fr Poseidon2 circuit.** The protocol would need to
   adopt the VM's native field (KoalaBear, Stark252, BabyBear) or accept field-op
   acceleration (OpenVM/SP1 Fp) or software BN254.

6. **RAM is prohibitive for all RISC-V backends** — 12-31GB. Only Cairo/Stwo has
   demonstrated phone viability.

7. **Jolt's power-of-2 trace padding** can double cost when near a boundary.

8. **Software Keccak on RISC-V is a trap** — worse than software Poseidon2.

9. **Signature verification (Grumpkin EC) adds ~20-30%** to proving time.

10. **Nexus is not competitive for hash-heavy workloads.** Only Keccak precompile exists;
    no Poseidon2 or SHA-256. Software BN254 on rv32 OOMs at realistic scale.

---

## Rejected backends

| Backend | Reason |
|---------|--------|
| Valida | Prover explicitly unsound (v1.0.0 release notes). secp256k1 opcodes are execution-only (no prover constraints). Host API is a CLI wrapper (no library-level hint passing). Keccak chip is interesting but benchmarks are meaningless if proofs are unsound. Revisit when soundness review completes. |
| zkWASM | Bulk memory extension (opcode 0xFC) incompatible with modern Rust |
| Ligetron | Exceptional memory (~100 MB), has Poseidon2/ECDSA. iPhones explicitly excluded in README, no proof recursion/composition yet. Proofs are MB-scale (sqrt(N)) but can be SNARK-wrapped for L1 verification. Monitor RISC Zero partnership. |

---

## Code reuse status

All backends except Cairo/Stwo use the shared `run_workload_end_to_end` runner
(`zkvm-test-contracts/runner.rs`), which exercises shared kernel logic, data structures,
serde, and runner overhead — making results directly comparable.

| Backend | Shared runner? | Notes |
|---------|:--------------:|-------|
| SP1 (all 4 variants) | YES | via `run_workload_end_to_end::<P>()` |
| Jolt | YES | via shared runner with JoltPrecompiles |
| OpenVM | YES | via shared runner with OpenVM precompile trait |
| Nexus | YES | via shared runner |
| Cairo/Stwo | No | hand-written Cairo — cannot use Rust crates |
