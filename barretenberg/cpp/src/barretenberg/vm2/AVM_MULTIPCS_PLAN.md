# AVM Multipcs — Overview & Benchmarks

## What it does

Groups `BATCH_SIZE` (BS) consecutive AVM polynomials into each commitment via on-the-fly interleaving:
`G(X) = f₀(X^BS) + X·f₁(X^BS) + ... + X^{BS-1}·f_{BS-1}(X^BS)`

The verifier reconstructs the group evaluation from individual sumcheck evaluations via a Lagrange combination over the interleaving challenges. The PCS extended challenge is `[interleaving_challenges || sumcheck_challenges]`, with `shift_exponent = BS`.

BS is a codegen parameter — regenerate with `AVM_BATCH_SIZE=N ./scripts/avm2_gen.sh`. No manual C++ changes needed.

## Status

BS=16 is fully implemented: prover, native verifier, and recursive verifier (Mega/Goblin path) all pass `vm2_tests`.

## Group counts (BS=16, current entity counts)

| Section | Entities | Groups (BS=16) |
|---------|----------|----------------|
| Precomputed | 122 | 8 |
| Wire | 2525 | 159 |
| Derived | 452 | 29 |
| Shifted | 363 | 23 |

Non-BS-aligned sections get zero-padded in the last group. An alignment padding of `NUM_SHIFT_ALIGNMENT_PADDING` zero-polys is inserted before shifted wires so shifted groups are BS-aligned.

## Benchmarks

`TwoLayerAvmRecursion/Padded` — minimal trace, padded proof, Mega recursive verifier. Avg of 3 runs.

| Metric | BS=1 | BS=16 | Δ |
|--------|------|-------|---|
| SRS load (one-time) | 190 ms | 2860 ms | +15× (SRS 16× larger) |
| wire commitments | 727 ms | 269 ms | **-63%** |
| log-deriv inverse | 155 ms | 127 ms | -18% |
| log-deriv commitments | 757 ms | 556 ms | -27% |
| sumcheck | 666 ms | 655 ms | ~0% |
| pcs rounds | 493 ms | 1409 ms | +186% |
| **construct_proof total** | **2803 ms** | **3022 ms** | **+8%** |
| AVM native prove (excl. SRS) | ~2.8s | ~3.1s | +8% |
| recursive verifier circuit | ~10s | ~9s | -1s |
| **total e2e (excl. SRS)\*** | **~13s** | **~12s** | **-1s** |
| peak RSS (SRS, one-time) | ~370 MiB | ~4207 MiB | +16× |
| proof size (unpadded) | ~14400 fields | 4511 fields | **-69%** |
| recursive verifier gates | 3,176,945 | 2,593,898 | **-18%** |
| Goblin ultra ops | 3138 | 239 | **-92%** |
| AVM verifiers per IPA budget (~4000 ops) | ~1 | **~16** | **+16×** |

_\* SRS is loaded once at process startup and amortized across all proofs. The native prove wall-time difference is dominated by SRS load (+2.7s). Excluding it, BS=16 is net faster end-to-end._

## Notes on prover cost

- **Wire/derived commitments**: fewer, larger MSMs — Pippenger overhead amortizes better, hence the speedup despite same total scalar-point work.
- **Sumcheck**: unchanged — operates on individual entity polynomials.
- **PCS rounds**: slower on minimal trace due to larger group polynomials and 4 extra Gemini rounds. Expected to amortize on full 2²¹ traces where PCS is already expensive.
- **Peak RSS**: entirely dominated by SRS (2^25 G1 points × 64 B ≈ 2 GiB, peaks ~4 GiB during load). No memory growth during proving itself.

## SRS requirement

Must be ≥ `MAX_AVM_TRACE_SIZE × BS = 2²¹ × 16 = 2²⁵` points. The existing file CRS (2²⁵ points) is exactly sufficient for BS=16.

## Files changed

| File | What |
|------|------|
| `vm2/generated/columns.hpp` | Interleaving constants (codegen) |
| `vm2/constraining/flavor.hpp` | Group constants, proof length formula, VK type |
| `vm2/constraining/flavor.cpp` | SRS size = circuit_size × BS, Gemini round count |
| `vm2/constraining/prover.cpp` | Interleaved commit rounds, materialized PCS |
| `vm2/constraining/verifier.cpp` | Group commitments, Lagrange eval combining, extended challenge |
| `vm2/constraining/recursion/recursive_flavor.hpp` | Group commitment transcript ops, extended Gemini rounds |
| `vm2/constraining/recursion/recursive_verifier.cpp` | Full multipcs PCS path mirroring native verifier |
| `vm2/proving_helper.hpp/cpp` | VK with precomputed group commitments |
| `vm2/constraining/gen_fixed_vk.cpp` | VK generator (individual + group commitments) |
| `vm2/constraining/avm_fixed_vk.hpp` | Auto-generated hardcoded VK |
| `barretenberg/cpp/scripts/avm2_gen.sh` | Regeneration script (PIL codegen + VK gen) |
