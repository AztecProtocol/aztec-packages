# GPU sumcheck — scoping document

Status: scoping only (2026-07-10). Follows the GPU MSM spike + bb-msm daemon work; see
README.md in this directory for the measured MSM results this builds on.

## Why

MSM offload is done and measured: the bb-msm daemon beats every prior configuration,
but whole-chain gains are Amdahl-capped because MSM is only ~38% of prover wall on a
16-core box (less on bigger boxes). Sumcheck is the dominant remaining slice and is
CPU-only everywhere. At current AWS pricing an equal-dollar CPU fleet matches the
16-core+L40S box on chain throughput; GPU sumcheck is the piece that extends the
measured 8-9x MSM-slice perf/$ to most of the prover and flips the fleet economics.

## What bb's sumcheck actually computes (Ultra)

Per round `i` over tables of size `2^(d-i)` (see `sumcheck/sumcheck_round.hpp`):

1. **Edge extension**: for each of `2^(d-i-1)` edges, extend ~44 entity polynomial
   pairs (`NUM_ALL_ENTITIES`, incl. shifts) from 2 evaluations to
   `BATCHED_RELATION_PARTIAL_LENGTH = 8` points (degree-7 after pow-batching).
2. **Relation accumulation**: evaluate 9 relation families (Arithmetic, Permutation,
   LogDerivLookup, DeltaRange, Elliptic, Memory, NonNativeField, Poseidon2Ext/Int) on
   the extended edges, alpha-batched, pow-scaled — a few hundred field muls per edge.
3. **Reduction**: sum the 8 univariate coefficients across all edges → 8 field
   elements to the transcript; Fiat-Shamir challenge (host); **fold**
   (`partially_evaluate`): `new[j] = a + r(b - a)` per entity, halving every table.

Round dependencies are serial (~20 rounds at 2^20) but each round is a massive
data-parallel map+reduce — the classic GPU shape. The transcript (Poseidon2/Keccak
hashing) stays host-side; per-round sync cost is negligible (8 field elements down,
one challenge up, 20 times).

The AVM flavor runs the same structure with ~2,948 columns (its own optimized round,
`compute_univariate_avm`) — bigger memory footprint, same algorithm.

## Open-source survey (the "reuse as much as possible" constraint)

| Option | License | Verdict |
|---|---|---|
| Ingonyama ICICLE sumcheck | frontend open, **CUDA backend closed/commercial** | Ruled out (same reason as for MSM) |
| sppark (Supranational) | Apache-2.0 | **No sumcheck**, but provides the pieces that matter: device BN254 field arithmetic (`ff/alt_bn128.hpp`, Montgomery `fp_t`), stream/device pool utilities, and it is already pinned, built, and correctness-validated in this tree |
| Tachyon (Kroma) | Apache-2.0 | GPU MSM/FFT for Halo2; no multilinear sumcheck; different stack |
| Binius / Irreducible GPU work | various | Binary fields — wrong domain |
| Academic GPU sumcheck codebases | various | Reference material only; none match bb's flavors/relations |

Conclusion: **no drop-in exists** — bb's sumcheck is inseparable from its
flavor-specific relations. The right reuse boundary is sppark's device *primitives*
(field arithmetic, streams), the same boundary the MSM integration validated,
including its hard-won rule: everything crossing to device code must be canonical /
explicitly-formed (sppark `fp_t` is Montgomery internally, which matches sumcheck's
algebra — the wire conversion lesson from the MSM work applies directly).

## Proposed design

Grow the bb-msm daemon toward `bb-gpu`: same schema/codegen/transport, new commands.

- **Resident witness**: upload all entity polynomials once per proof
  (2^20 × ~44 × 32 B ≈ 1.4 GB — comfortable on 24-48 GB cards). Synergy: these are
  the same columns the MSM commit phase consumes; one upload serves both, using the
  zero-copy ring ingress that already exists.
- **Per-round fused kernel**: thread handles E edges → loads entity pairs, extends to
  8 points, evaluates the 9 relations, pow-scales, block-reduces the 8 coefficients;
  grid reduction returns 8 field elements to host. Host runs transcript, returns the
  challenge; **fold kernel** (embarrassingly parallel) halves the tables in place.
- **Relations on device**: port the 9 Ultra relation `accumulate` bodies to sppark
  `fp_t` (mechanical: header-only FF algebra, ~9 files), each with golden-value tests
  against the CPU implementation on fixed seeds. Porting bb::fr itself to `__device__`
  is explicitly rejected (deep constexpr/intrinsic machinery; high risk, low reward).
  If drift risk proves real, a later mini-codegen from relation definitions can
  replace the hand ports (bb-pilcom already does exactly this for AVM relations).
- **Server-first scope**: rollup circuits prove with `disable_zk` — the non-ZK Ultra
  path covers production server proving. ZK masking/row-disabling and other flavors
  (Mega/ECCVM/Translator) are explicitly out of v1 scope. The AVM flavor is phase 5:
  same kernels, but 2,948 columns × 2^21 rows exceeds VRAM at max trace — needs
  column-chunked streaming (its round is already chunk-structured on CPU).

## Performance model (to be validated in phase 0)

Round-1 work ≈ 2^19 edges × ~500 muls ≈ 2.6e8 field muls, halving per round → ~5e8
muls total for 2^20. At achievable BN254 throughput on an L40S (order 10^10-10^11
muls/s), sumcheck compute is ~10-50 ms plus launch/reduction overhead — vs seconds on
16 cores. Expected: **~10-20x on the sumcheck slice**; combined with the existing MSM
offload, whole-proof time approaches witness-generation-bound, and the fleet math
(GPU box vs equal-dollar CPU cores) flips from ~parity to a clear GPU win. These are
model numbers; phase 0 replaces them with measurements.

## Phases and effort

| Phase | Content | Effort |
|---|---|---|
| 0 | Profile: exact per-circuit sumcheck share (BB_BENCH), device field-mul microbench on sppark `fp_t` | 2-3 days |
| 1 | Prototype: ArithmeticRelation-only round kernel + fold, golden tests vs CPU round | 1-2 weeks |
| 2 | All 9 Ultra relations on device; full round loop; transcript-identical proofs vs CPU | 2-3 weeks |
| 3 | Daemon integration (schema commands, shared resident witness with MSM commit), replay-benchmark measurement | 1-2 weeks |
| 4 | Hardening: CI GPU/CPU round-parity test, ZK variants if needed | 1 week |
| 5 | AVM flavor (column-streamed) | +4-6 weeks, separate go/no-go |

Total for production-shaped UltraHonk sumcheck-on-GPU: **~6-9 engineer-weeks**, with
the phase-1 prototype (~2 weeks in) as the natural kill/continue checkpoint — it
yields a real measured round speedup before the big relation-porting spend.

## Risks

- **Relation-port correctness** — the dominant risk (the MSM spike's coarse-form hunt
  is the cautionary tale). Mitigation: per-relation golden tests with deterministic
  seeds from day one, transcript-identical proof comparison as the phase-2 gate.
- **Relation drift**: CPU relations evolve; GPU ports must track. Mitigation: CI
  parity test per flavor; consider codegen (bb-pilcom precedent) if churn is real.
- **AVM memory** (phase 5 only): max-trace footprint exceeds VRAM; chunked streaming
  design required.
- **Occupancy at deep rounds**: tables shrink below GPU-efficient sizes; hand the last
  few rounds back to host (cheap — microseconds of work) rather than tuning kernels.
