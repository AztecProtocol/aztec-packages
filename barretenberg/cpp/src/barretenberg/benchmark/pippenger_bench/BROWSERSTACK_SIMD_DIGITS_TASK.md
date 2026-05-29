# Task: BrowserStack A/B for the SIMD x4 digit-extraction path

**For an agent with BrowserStack access (real V8, device matrix).** Native is done and shows a
small consistent win; the decision hinges on V8/ARM, where WASM SIMD lowering differs from
native and the path's own fast-path-rate tradeoff could flip the sign.

## The decision this resolves

Stage 1 (digit histogram) and Stage 4 (digit scatter) of the round-parallel Pippenger MSM
extract each scalar's signed-Booth window digit. There are two implementations:

- **SIMD x4** (`store_constantine_packed_digits_x4_*` in `pippenger_constantine.hpp`):
  processes 4 scalars per call via GCC `vector_size`, lowering to SSE2/NEON on native and
  `wasm-simd128` on WASM. Handles full 64-scalar chunks.
- **Scalar** (`get_constantine_packed_digit`): one scalar at a time. Already present as the
  `< SIMD_BATCH` remainder tail in both stages, and the proven-correct reference.

The SIMD x4 path carries an unverified self-flagged claim in its header comment:

> *"Switching from 2-wide uint64 to 4-wide uint32 doubles the compute throughput per SIMD
> instruction at the cost of slightly more straddle hits (the 'localised' fast-path rate
> drops from ~77% to ~50% at c=14), but compute dominates per-iter cost so the net win is
> positive."*

That "net win is positive" was never measured in isolation, and the localised-rate drop is
a real tradeoff that could land differently on V8 (where SIMD codegen quality and branch
behaviour differ from native clang).

## What is already established

Native EC2, HC=8, 5 reps, `PippengerSparsity` microbench. Δ = scalar vs SIMD;
positive = scalar slower, i.e. SIMD earns its keep:

| profile | size | Δ (scalar vs SIMD) |
|---|---|---|
| Dense80 | 2^15 | +1.3% |
| Dense80 | 2^16 | (+47.7% — noise outlier, scalar sd 14.4%; ignore) |
| Dense80 | 2^17 | +1.2% |
| Dense80 | 2^18 | +2.1% |
| Dense80 | 2^19 | +2.1% |
| DupHeavy | 2^15..2^19 | +1.0% to +2.2% |

So on native SIMD x4 is a **small, consistent ~1–2% win** — real but modest, because digit
extraction is a small fraction of total MSM time (Stage 6a bucket accumulation dominates).
Not a non-factor, not negative. The open question is whether that holds on V8/ARM.

## The exact question

For the Pippenger MSM under the shipping (mutex) thread pool, on each BrowserStack device
class:

1. Is SIMD x4 still a win on V8, a tie, or a **regression**?
2. Does the answer differ between x86 V8 (desktop Chrome) and ARM V8 (Android Chrome,
   iOS Safari)? WASM SIMD on ARM/NEON via V8 is the least-tested combination.
3. If it regresses anywhere: at which sizes / sparsity profiles, and by how much?

Scope: standalone `PippengerSparsity` microbench only — same benches used for native.

## How to select the path

Toggle in `scalar_multiplication.cpp::round_parallel_detail::msm_force_scalar_digits()`,
read once per process:

- **Runtime** (native / wasmtime): env `BB_MSM_SCALAR_DIGITS=<any value>` forces the scalar
  path; unset = SIMD x4 (default).
- **Compile-time** (browser, since env vars don't reach browser wasm): define
  `BB_MSM_FORCE_SCALAR_DIGITS` to bake the scalar path into the artifact.

Build two wasm artifacts:
- default (SIMD x4): `cmake --preset wasm-threads && cmake --build --preset wasm-threads --target pippenger_bench`
- scalar: add `-DBB_MSM_FORCE_SCALAR_DIGITS` to the preset's `CMAKE_CXX_FLAGS` (or pass via
  `cmake -DCMAKE_CXX_FLAGS=-DBB_MSM_FORCE_SCALAR_DIGITS ...`) and rebuild to a separate dir.

Both correctness-verified: all 86 ecc MSM tests pass in both modes (the forced-scalar path
produces byte-identical results — it is the same recoder, just unvectorised).

## Workload — microbench only

`PippengerSparsity` in `pippenger.bench.cpp` — 2 profiles × dyadic sizes 2^15..2^19:

- `Dense80`: 80% random nonzero, 20% zero.
- `DupHeavy`: 50% unique / 25% dup A / 5% dup B / 20% zero.

Deterministically seeded per (profile, size), so SIMD and scalar builds see byte-identical
scalars — paired comparison, no input variance.

## Method

- `HARDWARE_CONCURRENCY=8` (parity with native) and the device's natural HC.
- ≥5 reps; median + stddev; drop warmup (V8 tier-up). Trust only deltas clearing the band.
- The interesting cells are the larger sizes (2^17–2^19) where digit extraction is a
  meaningful absolute time and the localised-rate drop is most pronounced (c grows with N).

## Decision rule

- SIMD x4 wins or ties on all device classes → keep it (matches native; the ~1–2% is real).
- SIMD x4 regresses on ARM V8 specifically → mirror the threading lesson: consider a
  platform-conditional default (scalar on the regressing class, SIMD elsewhere), or if the
  regression is broad, default to scalar on WASM. The toggle already supports a compile-time
  default per artifact.
- Ties everywhere on V8 → the SIMD x4 complexity isn't earning its keep on the client
  platform; scalar is simpler and the recoder header could drop the x4 specialisations. Weigh
  against the native ~2% (native isn't the client target, so a V8 tie argues for simplifying).

## Deliverables

1. Per-device table: profile × size × {SIMD median±sd, scalar median±sd, Δ%}, at HC=8 and
   device-natural HC.
2. x86-V8 vs ARM-V8 split called out explicitly.
3. Recommendation: keep SIMD x4 / platform-gate it / drop it for scalar.

## Reference

- SIMD x4 helpers: `pippenger_constantine.hpp`
  (`store_constantine_packed_digits_x4_{localised,bottom,boundary}`, `gather_x4_u32`,
  `simd_u32x4_store`).
- Scalar reference: `get_constantine_packed_digit` (same file).
- Dispatch + toggle: `scalar_multiplication.cpp`, `msm_force_scalar_digits()` and the two
  `while (!force_scalar && i + SIMD_BATCH <= ...)` guards in Stage 1 / Stage 4.
- Microbench: `pippenger.bench.cpp`, `PippengerSparsity` (`{profile 0|1} × {2^15..2^19}`).
