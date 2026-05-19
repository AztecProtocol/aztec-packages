# Pippenger Rewrite Review Map

This is a reviewer-oriented map of the current Pippenger rewrite. It groups the
optimizations by the inefficiency they are trying to exploit, the heuristic or predicate
that activates them, and the specific risks worth reviewing before treating the rewrite as
production-ready.

## Immediate Red Flag

`ChonkTests.TestCircuitSizes` failing with:

```text
Assertion failed: (cluster_offsets_size == num_clus
Expected: 8193
```

points at the dedup Phase A bookkeeping, not at Chonk itself.

In `dedup_phase_a_worker_hash`, `clusters_opened` is incremented when a singleton is promoted
inside the hash table, before the cluster is flattened into `cluster_members` and
`cluster_offsets`:

- promotion: `clusters_opened++` at `scalar_multiplication.cpp:2135`
- flattening may stop early when `cluster_members_size + this_cluster_members > cluster_members_cap` at
  `scalar_multiplication.cpp:2164`
- the invariant later assumes every opened cluster was flattened:
  `cluster_offsets_size == num_clusters + 1` at `scalar_multiplication.cpp:2193`

So when the member cap is hit, `clusters_opened` can count clusters that were deliberately
left unflattened. The code comments claim those clusters fall through to normal Pippenger,
but the final `num_clusters = clusters_opened` makes the partial fallback inconsistent.
The first fix to review is to make the published cluster count equal the flattened cluster
count, and to ensure any promoted-but-unflattened entries have no redirect published.

## Optimization Inventory

| Area | Inefficiency targeted | Activation / heuristic | Main code | Review risks |
| --- | --- | --- | --- | --- |
| Constantine signed-window recoding | Carry propagation and branchy per-window scalar decoding | Always used in round-parallel path; precomputes per-window slice params and selects bottom/localized/boundary paths | `compute_constantine_slice_params*`, `get_constantine_packed_digit`, SIMD x4 helpers around `scalar_multiplication.cpp:118` and `:273` | Boundary-bit correctness, top-window masking, split-region last-window width, endian/aliasing assumptions for `uint32_t` scalar view |
| Window-size selection | Bad `c` gives too many rounds or too many buckets | Native cost model `rounds * (n + 15 * buckets)`; WASM closed form using `target_load` from logical thread count | `choose_window_bits` at `scalar_multiplication.cpp:479`; oversub factor at `:29` | Platform calibration, small/large crossover, whether `n` should be post-GLV working scalars or original points |
| GLV split | Halve scalar bit length at cost of doubling point count | `n_input <= 2^13` native, `n_input <= 2^16` WASM, or caller supplies external GLV table | threshold at `scalar_multiplication.cpp:535`; split/double at `:2831` | Sign convention for phi point, input scalar mutation/restoration asymmetry, memory pressure at crossover |
| Effective bit budget | Avoid windows above the actual largest scalar MSB | After Phase 1, `effective_num_bits` is highest non-empty `msb_hist` bin | `scalar_multiplication.cpp:2919` | Off-by-one in histogram bins; interaction with GLV halves and zero sentinel |
| Trivial MSM fallback | Pippenger scaffolding dominates very sparse or tiny active sets | `pts_per_thread < MIN_PTS_PER_THREAD_FOR_PIPPENGER` (`24`) after zero counting | `scalar_multiplication.cpp:2891`; constant in header | Correct Montgomery lifecycle before `trivial_msm_threaded`; preserving `PolynomialSpan::start_index` semantics |
| Variable-window split | Mixed scalar sizes waste high-bit windows on small scalars | Grid over `b_star`; upper population must be minority, at least 64 and 5% active; predicted split cost must be <= 85% unsplit | `choose_var_window_split` at `scalar_multiplication.cpp:721`; region dispatch at `:4574` | Boundary inclusion `msb >= b_star - 1`, last-window widths, `capacity_hi = n_large` while iterating `n`, upper schedule overflow |
| Small-set peel | Split lower region too small to amortize Pippenger | If split fires and `n_small` per thread is below trivial threshold, compute small set with Straus and run Pippenger only on large set | `scalar_multiplication.cpp:2989` | Currently comments mention dedup integration, but Phase A runs later so dedup data is unavailable; verify this is harmless or dead code |
| Round-parallel pipeline | Legacy per-thread work balance and repeated bucket reductions | Main path after dispatch: stages 1-7 over window batches sized by arena budget | staged lambda starts around `scalar_multiplication.cpp:3690` | Race-free cursor reuse, per-window capacity, Stage 1 and Stage 4 decode equivalence |
| SIMD digit extraction | Scalar decoding is compute-heavy and non-vectorized | `SIMD_BATCH = 64`; 4-wide `uint32_t` vector helpers selected by per-window path | `scalar_multiplication.cpp:3728` | Strict aliasing/layout assumptions, tail handling, all-included mask path |
| In-place histogram/prefix reuse | Avoid separate bucket-total and cursor buffers | `digit_cursors` is counts in Stage 1, per-thread offsets in Stage 2, scatter cursors in Stage 4 | `scalar_multiplication.cpp:3903` | Stage ordering, no read-after-overwrite mistakes, capacity and bucket 0 handling |
| Dedup pre-pass | Duplicate scalar values in witness/permutation polynomials cause repeated base-point additions | Explicit `dedup_hint`; long scalars only (`msb >= c_threshold`); caps: 16,384 clusters and 32,768 members | caps at `scalar_multiplication.cpp:1904`; worker at `:1972`; hints wired through `CommitmentKey` | Current failing assertion; cap fallback invariants; duplicate detection by one-limb fingerprint plus memcmp; GLV interaction |
| Dedup patching | Keep hot Stage 4 loop dedup-free after first batch | First batch emits ordinary schedule, Phase A populates redirects, `dedup_patch_schedule_window` compacts skips; later batches omit skips up front | `scalar_multiplication.cpp:2283`; Stage comments at `:3973` | First-batch vs later-batch equivalence, sign preservation on redirects, upper split reuse |
| Arena zoning | Reduce allocator churn and WASM fragmentation; bound resident scratch | `compute_arena_bytes_for_msm`, `BATCH_MEM_BUDGET = 32 MiB`, Zone P/W/S layout | sizing around `scalar_multiplication.cpp:2754`; zone layout at `:3276` | Sizer and allocator formulas must stay exactly mirrored; absolute alignment; zero-initialization assumptions |
| Per-worker scratch overlay | Avoid summing all scratch lifetimes into memory budget | Phase A and Stage 6 scratch share Zone W union because they run in separate parallel phases | `scalar_multiplication.cpp:3318` and `:3443` | No overlapping lifetimes; worker id equals task id assumption; later refactors can violate this silently |
| Recursive affine bucket reduction | Replace projective bucket suffix sums with batched affine additions/doublings | Stage 6b always rebalances bucket ranges; stride is power-of-two; trivial stride <= 2 fallback | `recursive_affine_bucket_reduce_strided` around `scalar_multiplication.cpp:1320`; Stage 6b at `:4424` | Algebraic equivalence of `R`/`L`; batch-affine breakeven fallback; handling sparse windows and empty chunks |
| Dense bucket partials | Avoid sorted scans during cross-thread merge | Stage 6a writes dense per-thread bucket rows; Stage 6b looks up overlapping digit ranges directly | Stage 6a at `scalar_multiplication.cpp:4368`; Stage 6b at `:4474` | Boundary buckets shared by original chunks, overflow buffer sizing, present bitmap reset coverage |
| Batched MSM sharing | Chonk commits many MSMs over the same SRS prefix | Batch driver runs one MSM at a time but shares GLV-doubled SRS buffer and one max-sized arena | `pippenger_round_parallel_batched` at `scalar_multiplication.cpp:4660` | Pointer-range grouping assumes shared contiguous SRS allocation; no cross-MSM scalar scheduling is actually batched |

## Dedup-Specific Review Checklist

Dedup is the most suspicious optimization because it has a clear Chonk failure and is only
enabled through hints. Review it as a separate feature before judging the whole rewrite.

1. Confirm the hinted call sites are the intended duplicate-heavy polynomials, not blanket
   activation. Hints enter via `CommitmentKey::commit`, `batch_commit`, and `BatchBuilder`.
2. Make cap fallback mechanically correct:
   `clusters_opened`, flattened cluster count, `cluster_offsets_size`, and published
   redirects must describe the same set of clusters.
3. Add or strengthen tests where the cap is hit by many small clusters, not only one giant
   cluster. The existing cap/carry test describes a mega-cluster shape, which would not catch
   opened-but-unflattened many-cluster drift.
4. Check split interaction: Phase A is based on first batch/window-0 schedule, but redirects
   are reused for later windows and upper split region.
5. Check GLV interaction: after GLV, duplicate scalar halves may not correspond to duplicate
   original scalars, and points are `[P, phi(P)]`. Dedup is still algebraically valid if it
   aggregates points attached to equal working scalar values, but tests should cover it.

## Suggested Review Order

1. Make all correctness tests pass with dedup disabled and enabled separately. If disabling
   dedup fixes `ChonkTests.TestCircuitSizes`, keep the review scoped until Phase A is repaired.
2. Lock down algebraic equivalence tests for the staged pipeline using random scalars,
   sparse scalars, duplicate-heavy scalars, GLV threshold boundaries, and forced split via
   `VAR_WINDOW_FORCE_SPLIT`.
3. Review memory safety after correctness: arena sizing mirrors, worker scratch lifetimes,
   overflow bounds, and capacity assumptions.
4. Only then treat benchmark numbers as meaningful. Several choices are calibrated constants
   (`GLV_SMALL_N_THRESHOLD`, `BATCH_CAPACITY`, split 85% margin, 32 MiB budget), so a passing
   correctness suite should precede any argument about wins.

## Independent Clutter / Split-Out Candidates

Some changes in the branch are not intrinsically part of the Pippenger arithmetic rewrite.
They either change unrelated runtime behavior or add development scaffolding that makes the
review harder. Treat these as candidates for removal or separate PRs unless a bench proves
they are required for the headline result.

| File / area | Change | Why it is clutter or too broad | Suggested disposition |
| --- | --- | --- | --- |
| `barretenberg/cpp/CMakePresets.json` | Removes the `WASI_SDK_PREFIX=/opt/wasi-sdk` default from the `wasm-threads` preset | Build-system regression; no MSM performance value | Revert in this PR |
| `barretenberg/cpp/src/barretenberg/bbapi/bbapi_chonk.cpp` | Adds `BB_SKIP_SANITY_VERIFY` | Benchmark/debug convenience that weakens the default prove path's self-check | Remove or keep only in a benchmark harness |
| `barretenberg/cpp/src/barretenberg/sumcheck/sumcheck_round.hpp` | Adds one `BB_BENCH_NAME` inside sumcheck | Profiling annotation outside MSM/commitment code | Move to profiling-only cleanup if desired |
| `barretenberg/cpp/src/barretenberg/vm2/constraining/prover.cpp` | Removes `AVM_MAX_MSM_BATCH_SIZE` batching control | Changes AVM prover behavior as a side effect of commitment batching | Revert unless the new commitment API requires it and AVM is measured |
| `barretenberg/cpp/src/barretenberg/benchmark/pippenger_bench/*` | Deletes `thread_scaling`, adds `small_msm_matrix`, rewrites `pippenger.bench` | Useful development tooling, but it expands review surface | Split into benchmark/support PR or keep only minimal reproducible benches |

The global `parallel_for` rewrite in `barretenberg/cpp/src/barretenberg/common/thread.cpp` is
not simple clutter, but it is too broad for a Pippenger PR unless it is necessary for the
measured win. It changes scheduling for every `parallel_for` caller in barretenberg: sumcheck,
translator, VM2, ECCVM, and non-MSM prover code can all regress independently. Test this by
reverting/isolating the thread-pool rewrite and rerunning the native public-transfer bench. If
the MSM rewrite keeps most of the win, split the thread-pool change out.

Similarly, `barretenberg/cpp/cmake/threading.cmake` adding `-msimd128` may support the wasm
SIMD copy path, but it changes wasm runtime requirements. Keep it only with a separate wasm
compatibility justification and benchmarks; otherwise remove it from the native-focused
Pippenger rewrite.

Dedup hint plumbing in Oink, ECCVM, and Translator is not independent clutter, but it is
speculative. Keep only hints whose labels show meaningful `duplicate_excess / size` under
`BB_COMMITMENT_DEDUP_TRACE=1`; remove blanket hints that do not pay.

## Instrumentation

The branch has local MSM tracing and ablation switches in `scalar_multiplication.cpp`:

- `BB_MSM_TRACE=1` emits one `BB_MSM_TRACE {...}` line per MSM.
- `BB_COMMITMENT_DEDUP_TRACE=1` emits one `BB_COMMITMENT_DEDUP_TRACE {...}` line per
  commitment candidate, including Chonk polynomial labels when the commitment goes through a
  batch.
- `BB_IPA_TRACE=1` emits the IPA opening size ladder: one start line and one line per IPA
  reduction round.
- `BB_MSM_NO_GLV=1` disables inline and shared batched GLV.
- `BB_MSM_NO_DEDUP=1` ignores dedup hints and sizes the arena accordingly.
- `BB_MSM_NO_VAR_SPLIT=1` disables the variable-window split heuristic.

Useful trace fields:

- `n_input`, `n_working`, `n_active`
- `use_glv`, `external_glv`
- `dedup_hint`, `dedup_active`, `dedup_clusters`, `dedup_ms`
- `effective_num_bits`, `window_bits`, `split`, `b_star`, `n_large`
- `windows_lo`, `windows_hi`, `windows_per_batch_lo`, `windows_per_batch_hi`
- `phase1_ms`, `pipeline_ms`, `total_ms`

For the `ecdsar1+transfer_0_recursions+sponsored_fpc` flow, compare the full branch against:

```bash
BB_MSM_TRACE=1
BB_MSM_TRACE=1 BB_MSM_NO_GLV=1
BB_MSM_TRACE=1 BB_MSM_NO_DEDUP=1
BB_MSM_TRACE=1 BB_MSM_NO_VAR_SPLIT=1
BB_MSM_TRACE=1 BB_MSM_NO_GLV=1 BB_MSM_NO_DEDUP=1
```

The fastest way to answer the current attribution question is to group trace lines by
`curve`, `n_input`, `use_glv`, and `dedup_clusters`. If the large `2^19` BN254 MSMs still
improve with `use_glv=false` and `dedup_clusters=0`, the staged Pippenger path is likely a
real contributor. If the wins concentrate in `n_input <= 8192` or duplicate-heavy calls, the
headline should be narrowed to GLV, fallback, and dedup-heavy workloads.

For dedup attribution by Chonk polynomial, run the same flow with:

```bash
BB_MSM_TRACE=1 BB_COMMITMENT_DEDUP_TRACE=1 BB_IPA_TRACE=1
```

`BB_COMMITMENT_DEDUP_TRACE` reports exact duplicate density only for dedup-hinted
polynomials, so it should stay cheap enough to use on full Chonk flows while answering which
labels are actually responsible for the dedup win. Group by `label`, `size`, and
`duplicate_excess`; the labels with the largest `duplicate_excess / size` should line up with
the MSM trace lines that have large `dedup_clusters`.

`BB_IPA_TRACE` has no dedup stats because IPA scalars are challenge-derived and call
`pippenger_unsafe` without a duplicate hint. Its purpose is to correlate the Grumpkin IPA
round ladder with `BB_MSM_TRACE` and `batch_mul_with_endomorphism` timings, especially the
`2^15 -> ... -> 1` sequence in ECCVM IPA.

## Empirical Results

### `ecdsar1+transfer_0_recursions+sponsored_fpc`, native (clang20-no-avm, 16 threads)

Branch `lde/zacs-pippenger` (`758407a0835`) vs baseline `merge-train/barretenberg`
(`4da6ab07f2c`), EC2 single run.

Native Chonk flow matrix:

| Flow | Circuits | Baseline `ChonkAPI::prove` | Branch `ChonkAPI::prove` | Status |
| --- | --- | --- | --- | --- |
| `ecdsar1+transfer_0_recursions+sponsored_fpc` | 9 | 4.48 s | 3.46 s | -22.8% |
| `ecdsar1+transfer_1_recursions+private_fpc` | 17 | 7.75 s | aborted | Arena overflow, 1.70 MB needed vs 1.21 MB cap |

| Stage | Baseline | Branch | Delta |
| --- | --- | --- | --- |
| `ChonkAPI::prove` (total) | 4.48 s | 3.46 s | -22.8% |
| `OinkProver::prove` (8 calls, avg/iter) | 891.5 ms (111.4 ms) | 568.6 ms (71.1 ms) | -36.2% |
| `Goblin::prove_eccvm` | 829.5 ms | 574.2 ms | -30.8% |
| `IPA::compute_opening_proof` | 292.1 ms | 170.0 ms | -41.8% |
| `MSM::batch_multi_scalar_mul` (oink, 38 calls) | 1.06 s (27.9 ms) | 659 ms (17.3 ms) | -37.8% |
| `CommitmentKey::commit` (oink wires, 53 calls) | 263.4 ms (4.97 ms) | 151.3 ms (2.85 ms) | -42.6% |
| `CommitmentKey::commit` (z_perm, 5 calls) | 189.2 ms (37.8 ms) | 133.7 ms (26.7 ms) | -29.4% |
| `batch_mul_with_endomorphism` (IPA, 15 calls) | 180.7 ms (12.05 ms) | 108.9 ms (7.26 ms) | -39.7% |
| `ChonkLoad` (msgpack decode, no MSM) | 100.1 ms | 106.8 ms | +6.7% (noise) |

`IPA::compute_opening_proof` runs on random IPA challenge scalars with no `dedup_hint`,
so its -42% delta is attributable to the non-dedup parts of the rewrite (round-parallel
pipeline + Bernstein-Yang inversion + batch-affine bucket accumulation). The per-call
oink-commit delta (-43%) is roughly the same magnitude, implying dedup adds at most a few
percent over the non-dedup baseline on this workload, not the 20-30% earlier guess.

### Native ablations, same flow

All runs are single-run EC2 native (`clang20-no-avm`, 16 threads), comparing against the
uninstrumented branch wallclock of 3.46 s.

| Run | `ChonkAPI::prove` | Delta vs branch | Implication |
| --- | --- | --- | --- |
| Branch, uninstrumented | 3.46 s | baseline | Full rewrite result |
| `BB_MSM_NO_DEDUP=1` | 3.57 s | +0.11 s (+3.2%) | Dedup saves about 110 ms |
| `BB_MSM_NO_GLV=1 BB_MSM_NO_DEDUP=1` | 3.61 s | +0.15 s (+4.3%) | GLV adds about 40 ms on top of dedup |
| `BB_MSM_NO_GLV=1` | aborted | - | Arena mirror bug exposed when dedup remains active |

Attribution against the full baseline-to-branch delta (`4.48 s -> 3.46 s`, 1.02 s saved):

| Source | Approx saved | Share of baseline wallclock | Share of branch win |
| --- | --- | --- | --- |
| Dedup | 110 ms | ~2.5% | ~12% |
| GLV | 40 ms | ~1% | ~3% |
| Non-dedup, non-GLV rewrite | 870 ms | ~19.5% | ~85% |

This materially changes the review posture: the rewrite's native win on this flow does not
stand or fall on dedup or GLV. The actual headline is the non-dedup, non-GLV path:
Bernstein-Yang inversion, staged affine bucket reduction, batch-affine arithmetic,
round-parallel scaffolding, and Constantine recoding. The no-dedup IPA evidence above is
consistent with this attribution: IPA drops 122 ms by itself without duplicate stripping.

The failed `BB_MSM_NO_GLV=1` run is also important. It hits the same
`aligned_local + bytes <= bound_bytes` arena assertion class as the wasm crash, but on native
when GLV is force-disabled and dedup stays enabled. Together with the dedup cap miscount,
this makes "arena/sizer mirror drift across feature combinations" a single top-priority
correctness item rather than isolated bugs.

### Triple-traced public-transfer ablation

Same `ecdsar1+transfer_0_recursions+sponsored_fpc` native flow with
`BB_MSM_TRACE=1 BB_COMMITMENT_DEDUP_TRACE=1 BB_IPA_TRACE=1`. The extra per-coefficient
duplicate sort raises logging overhead to about 5%, so these deltas are relative to the
traced branch baseline of 3.66 s, not the uninstrumented 3.46 s.

| Run | `ChonkAPI::prove` | Delta vs traced branch | Implication |
| --- | --- | --- | --- |
| Traced branch | 3.66 s | baseline | Full branch with tracing |
| `BB_MSM_NO_VAR_SPLIT=1` | 3.64 s | -20 ms | Variable split is a small wallclock regression |
| `BB_MSM_NO_DEDUP=1` | 3.75 s | +90 ms | Dedup saves about 90 ms under tracing |

Dedup payload by hinted label, sorted by `zero_count + duplicate_excess` ("bucket adds
avoided"):

| Label | Calls | Total n | Zeros | Real dup excess | Avoided | Avoided / n |
| --- | --- | --- | --- | --- | --- | --- |
| `W_4` | 9 | 444,229 | 188,073 | 87,968 | 276,041 | 62.1% |
| `W_O` | 9 | 444,229 | 196,970 | 75,721 | 272,691 | 61.4% |
| `W_R` | 9 | 444,229 | 141,131 | 131,493 | 272,624 | 61.4% |
| `W_L` | 9 | 444,229 | 111,274 | 159,766 | 271,040 | 61.0% |
| `<single>` commit path | 2 | 163,838 | 1 | 87,969 | 87,970 | 53.7% |
| `Z_PERM` | 9 | 444,229 | 1 | 69,576 | 69,577 | 15.7% |
| ECCVM `MSM_X*` / `MSM_Y*` | 1 each | 4,953 each | ~1,100 | ~3,000 | ~4,000 | 67-84% |
| ECCVM `PRECOMPUTE_DX/DY` | 1 each | 4,952 each | 1,085 | 3,494 | 4,579 | 92% |
| ECCVM `TRANSCRIPT_*` accumulators | 1 each | 4,952 each | 4,147-4,478 | 142-763 | 4,610-4,910 | 93-99% |

The wires are the dominant target: `W_L/R/O/4` account for about 1.09M of 1.31M avoided
bucket additions across the prove, roughly 83% of the dedup payload. `Z_PERM` is the smallest
hinted Honk polynomial by density, but it has essentially no zeros; its 15.7% comes from real
constant-product stretches, not padding. The ECCVM hints are tiny in aggregate but high
density; transcript accumulator hints are mostly a single large zero cluster, so a simpler
zero-strip path may be cheaper there than the full dedup state machine.

Structural zeros versus real repeats in the main Honk polynomials:

| Label | Zero share | Real-dup share |
| --- | --- | --- |
| `W_L` | 25% | 36% |
| `W_R` | 32% | 30% |
| `W_O` | 44% | 17% |
| `W_4` | 42% | 20% |
| `Z_PERM` | 0% | 16% |

This means dedup is not just an expensive zero-stripper. Wires are a mix of sparse padding and
genuine value reuse; `W_L` and `W_R` have more real duplicates than zeros, and `Z_PERM` is
purely real repeats.

Order-joined MSM timing reproduces the dedup wallclock delta at the MSM level:

| `n_input` bucket | Calls | Dedup-active calls | `NO_DEDUP - baseline` total_ms | Avg `dedup_clusters` |
| --- | --- | --- | --- | --- |
| 256-1k | 14 | 0 | -1 ms | - |
| 1k-4k | 27 | 0 | -7 ms | - |
| 4k-16k | 85 | 21 | +19 ms | 984 |
| 16k-64k | 37 | 21 | +29 ms | 1,931 |
| 64k-128k | 35 | 21 | +55 ms | 5,111 |
| 128k+ | 3 | 0 | -8 ms | - |
| Total heavy MSMs | 201 | 63 | +87 ms | - |

About 63% of the dedup gain is in the 64k-128k bucket, exactly the Honk wire/z_perm commits.
The 4k-16k bucket contributes a smaller but real payoff from the ECCVM polynomials.

Variable-window split looks like an anti-optimization on this Chonk flow:

| Bucket | Calls | `split=true` in baseline | `NO_VAR_SPLIT - baseline` total_ms |
| --- | --- | --- | --- |
| 16k-64k | 37 | 14 | -17 ms |
| 64k-128k | 35 | 16 | -16 ms |
| Others | 129 | 1 | -11 ms |
| Total heavy MSMs | 201 | 31 | -44 ms |

The predictor fires 31 times and loses about 1.4 ms per split decision. The current rule
accepts a split when predicted cost is at most 85% of unsplit; on this workload the predictor
is either overestimating split savings or the unsplit path has become fast enough that this
margin is now too generous. Disable variable split by default, or retune it, before audit.

IPA structure from the same trace: one Grumpkin IPA opening uses `poly_length=32768`, 15
rounds, 30 Pippenger calls, and 15 `batch_mul_with_endomorphism` calls. The round ladder is
`16384 -> ... -> 1`. None of these calls has a dedup hint, so the IPA part of the speedup is
entirely non-dedup: Bernstein-Yang inversion, staged affine bucket reduction, round-parallel
pipeline, and batch-affine arithmetic.

Updated attribution for this flow:

| Component | Approx effect | Review implication |
| --- | --- | --- |
| Non-dedup, non-GLV, non-var-split rewrite | ~960 ms saved | Main headline; keep focus here |
| Dedup | ~90 ms saved | Real and well targeted; mostly Honk wires |
| GLV | ~40 ms saved | Small contributor from prior ablation |
| Variable-window split | ~44 ms regression | Disable or retune |

Concrete actions from this trace:

1. Disable `choose_var_window_split` by default, or make its threshold much stricter.
2. Keep dedup as a targeted Chonk optimization, but fix the cap/arena correctness bugs before
   defending it for merge.
3. Consider replacing the ECCVM transcript accumulator dedup case with a cheaper zero-heavy
   path if it remains measurable after the correctness work.

### `ecdsar1+transfer_1_recursions+private_fpc`, native baseline

Baseline `merge-train/barretenberg` (`4da6ab07f2c`) proves this flow in 7.75 s. The branch
(`758407a0835`) aborts before a branch timing can be collected:

```text
aligned_local + bytes <= bound_bytes
1.70 MB needed vs 1.21 MB cap
```

This flow is roughly "more of the same" compared with transfer_0: 17 circuits vs 9 circuits,
and baseline wallclock scales from 4.48 s to 7.75 s. Per-circuit baseline time is slightly
lower on transfer_1 (456 ms vs 498 ms), so the private-recursive flow is not a qualitatively
different workload; it is a larger real Chonk workload that the branch currently cannot
prove.

Baseline slices:

| Stage | Baseline time | Calls x avg |
| --- | --- | --- |
| `Chonk::accumulate_and_fold` | 4.12 s | 16 x 257.7 ms |
| Dominant Mega `OinkProver::prove` | 2.14 s | 16 x 133.5 ms |
| `commit_to_wires` | 855.8 ms | 17 x 50.3 ms |
| `commit_to_z_perm` | 782.4 ms | 17 x 46.0 ms |
| `commit_to_lookup_counts_and_w4` | 387.5 ms | 17 x 22.8 ms |
| `commit_to_logderiv_inverses` | 225.2 ms | 17 x 13.2 ms |
| `HypernovaFoldingProver::sumcheck` | 894.3 ms | 16 x 55.9 ms |
| `Goblin::prove_eccvm` | 995.0 ms | - |
| `IPA::compute_opening_proof` | 276.3 ms | - |
| `BatchedHonkTranslatorProver::prove` | 944.5 ms | - |
| `MSM::batch_multi_scalar_mul` (top context) | 2.25 s | 70 x 32.1 ms |

The branch abort here expands the arena hypothesis from "sizer and allocator drift across
feature toggles" to "sizer and allocator drift across real workloads." Transfer_0 native
fits the current arena bound by accident; transfer_1 native exceeds it by about 40%.

### `BB_MSM_TRACE=1` aggregates, same flow

525 MSM calls captured. Logging overhead 3.46 -> 3.52 s (~2%).

| Path | Calls | Total | Avg |
| --- | --- | --- | --- |
| `pippenger_round_parallel` (heavy) | 201 | 1186 ms | 5.90 ms |
| `trivial_pre` / `trivial_post_profile` | 312 | ~0 ms | 0 |
| `empty` | 12 | 0 ms | 0 |

Heavy-path breakdown by `n_input`:

| `n_input` | Calls | Total | Avg | Dedup-active calls | Avg `dedup_clusters` |
| --- | --- | --- | --- | --- | --- |
| 256-1k | 14 | 9 ms | 0.64 ms | 0 | - |
| 1k-4k | 27 | 29 ms | 1.07 ms | 0 | - |
| 4k-16k | 85 | 90 ms | 1.06 ms | 21 | 985 |
| 16k-64k | 37 | 336 ms | 9.08 ms | 21 | 1930 |
| **64k-128k** | **35** | **543 ms** | **15.51 ms** | **21** | **5111** |
| 128k+ | 3 | 179 ms | 59.67 ms | 0 | - |

Observations:

- The 64k-128k bucket dominates wallclock (543 ms = 15% of total prove). 5111 clusters on
  88-128k inputs corresponds to ~5-7% cluster density - matches the "few huge clusters"
  shape from structural-padding zeros and constant z_perm regions.
- Dedup fires on 63 of 201 heavy calls, distributed as exactly 21 in each of the 4k-16k,
  16k-64k, 64k-128k buckets. That is 7 dup-hinted commits per prover stage x 3 prover
  stages, i.e. wires + z_perm getting consistent dedup activation. No
  `dedup_hint=true,dedup_active=false` cases were observed on this flow.
- 128k+ MSMs (ECCVM/IPA SRS commits) correctly run without dedup; their scalars are
  challenges and zero-padding does not appear.
- Trace currently reports `dedup_clusters` but not `dedup_members_flattened` /
  `dedup_members_dropped`. Adding those would let the cap-fallback drift from the
  immediate red flag section be diagnosed empirically rather than by code reading.

### WASM bench: blocked by arena overflow on the same flow

`build-wasm-threads/bb prove --scheme chonk` aborts on this flow at:

```text
abort: Assertion failed: (aligned_local + bytes <= bound_bytes)
  Left   : 674112
  Right  : 623757
```

Crash site is the arena allocator bookkeeping (~50 KB over a 624 KB cap, ~8%) during the
hiding kernel's IPA opening. Baseline wasm runs the same flow in 12.06 s, so this is a
branch regression specific to wasm. Likely candidates:

- Alignment padding differs between wasm and native, and the sizer
  (`compute_arena_bytes_for_msm`) does not mirror the allocator exactly. The doc
  already calls out this as a top-tier risk under "Arena zoning".
- Concurrency surfaced from wasi-threads under `HARDWARE_CONCURRENCY=16` may not match
  what the sizer assumed when picking per-worker scratch caps.

This blocks any wasm performance comparison until fixed. Worth treating as the next
correctness item after the dedup cap fallback, since it manifests on a real production
flow rather than a unit test.

The arena assertion now has four distinct reproductions:

| Scenario | Overflow | Severity |
| --- | --- | --- |
| transfer_0 native + `BB_MSM_NO_GLV=1` | unrecorded | Ablation-only but same assertion |
| transfer_0 wasm | ~8%, 674 KB needed vs 624 KB cap | WASM regression |
| transfer_1 native, no flags | ~40%, 1.70 MB needed vs 1.21 MB cap | Production-path crash |
| dedup cap fallback | cluster count drift | Unit-test correctness failure |

This makes arena/sizer mirroring a blocker for the rewrite, not an optional cleanup item.

### Two preset/cmake regressions noted while reproducing

Outside MSM code itself, the branch silently changed wasm/cmake behavior:

- `CMakePresets.json` removed the `WASI_SDK_PREFIX=/opt/wasi-sdk` default from the
  `wasm-threads` preset environment block. Builds now fail with
  `#include <string.h>` not found unless `WASI_SDK_PREFIX` is exported externally.
- `cmake/threading.cmake` added `-msimd128` for WASM multithreaded builds. Hot loops
  (Phase 5a sched -> pts copy) depend on `v128.load/store` at runtime, so any older
  V8/wasmtime would now fail differently. The bench machine runs wasmtime 43, which is
  fine; production wasm consumers should be checked.
