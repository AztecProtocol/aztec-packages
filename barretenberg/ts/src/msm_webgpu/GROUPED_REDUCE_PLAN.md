# Fold-tower bucket reduction — WebGPU port of CPU Stage 6b + chunk_contribution

Branch `zw/optimise-reduction`. Scope: the bucket-reduction phase only — the
kernels and schedule behind `setPhase('reduce')` in `msm_v2.ts`
(`ba_reduce_level_bench`, `ba_reduce_level_jacobian`, `ba_reduce_z_init`,
`ba_reduce_jac_to_affine`, `ba_reduce_jac_finalize`, `buildReducePasses`).
The walker / combine_batched / pt_* stages are owned by other threads.

This REPLACES the previous revision of this document. The previous design made
level 0 Jacobian-first; that was based on a wrong inversion-cost estimate and
is withdrawn (see §2). The replacement is batch-affine-first throughout, with
the existing per-level affine↔Jacobian toggle retained for narrow levels.

Reference: `~/barretenberg-claude-2/barretenberg/cpp/src/barretenberg/ecc/
scalar_multiplication/scalar_multiplication.cpp` ("CPU"): Stage 6b rebalanced
bucket-slice tasks (line ~4298), `recursive_affine_bucket_reduce_strided`
(~1276), `ChunkOutput`/`chunk_contribution` (~1141/~1603), Stage 7 (~4564).

## 1. Problem statement and baseline

Per window w (B_w = 2^(c_w−1) buckets, slot j holds magnitude j+1) we need

    S_w = Σ_{j=0}^{B_w−1} (j+1)·V_j        (V_j affine, is_present-masked)

then host-side Horner over windows (unchanged by this plan).

Baseline (N=2^17 traces, c=13, NW=20, stride=4096; see
`~/barretenberg-msm-webgpu-experiments/msm_single_{adreno,mali}.perfetto`):

| | Adreno (S25+) | Mali (Pixel 9A) | M-series local |
|---|---|---|---|
| reduce phase | 10.45 ms (12.7 %) | 38.48 ms (15.5 %) | ~6.1 ms (M2 ref) |
| passes | 35 (3 waves: 12/11/12) | 35 | 35 |
| per-pass floor | ~140 µs | ~540 µs | small but nonzero |
| floor × ~20 tail passes | ~2.8 ms | ~11 ms | — |

Structural faults of the current reduce:
1. Every pass dispatches `numWindows` (=20) workgroups → ≤ 2,560 threads, on
   GPUs that need 10–40k threads. Even the widest pass runs at ~19 ns/add
   (Adreno) — occupancy-bound, nowhere near ALU limits.
2. `buildReducePasses(stride, l0Log=1)` runs the 4-phase schedule over the
   WHOLE window as ONE chunk: per-level width collapses 2048→1 three times
   (the three waves), so ~20 of 35 passes run nearly empty at the fixed floor.
3. The affine↔Jacobian toggle (`useJac` / T_SAT_REDUCE) only changes per-add
   cost; it cannot fix pass count or thread count.

What the current WGSL *already shares* with the CPU: the 4-phase intra-chunk
kernel — `buildReducePasses` phases A–D mirror
`recursive_affine_bucket_reduce_strided`, and `ba_reduce_level_bench` is a
correct per-thread-batched-inversion implementation of one level. What it
*dropped* is the structure that makes the CPU fast: Stage 6b's partition of
the BUCKET-INDEX SPACE into many independent chunks, and the
`chunk_contribution` lift `Σ_chunks (L + (lo−1)·R)` that recombines them
exactly. Those two pieces ARE the parallel algorithm; this plan ports them.

## 2. Cost model — MEASURED (M0 calibration, 2026-06-09)

Via `?autorun=micro&op=mul|inv` (BigInt-body montmul chain / pk14 f8 inverse
chain), driven by drive-persist (M4) and content_shell-over-adb (phones),
all under bench locks. Raw rows in `fastbench_results_5224.jsonl`.

**Montmul throughput vs thread count (BigInt-body mul, montmuls/ms, median):**

| threads | M4 | Adreno 830 (S25+) | Mali G715 (9A) |
|---|---|---|---|
| 2,560 (= today's reduce width) | 144k | 68k | 22k |
| 10,240 | 874k | 252k | 40–57k |
| 20,480 | 1,030k | — | — |
| 40,960 / 65,536 | 1,180k | 458k | 113–126k |

Every device is severely occupancy-starved at today's reduce width: the SAME
montmul runs **6.1× (M4), 6.7× (Adreno), ~5× (Mali)** faster per-op at
10–40k threads than at 2,560. Thread width is the most valuable resource.

**pk14 inverse (`fr_inv_by_loop_pk`), 10,240 threads:** M4 50.0k inv/ms,
Adreno 14.4k, Mali ~3.0–3.6k → **inv ≈ 17.5 / 17.5 / 13–16 BigInt-montmul
equivalents** on M4 / Adreno / Mali. Structurally (27 batches × one in-place
14-bit matrix apply) this is ~30–50 f8-montmul-equivalents.

**Known confound, bounded not resolved:** the micro `mul` uses the BigInt
20×13 body; the reduce kernels use the lighter f8 body. Fitting today's
widest reduce pass (40,960 candidates × ~6 f8-muls in 780 µs at 2,560
threads on Adreno) implies f8-mul ≈ 4–5× cheaper than the BigInt micro mul
at equal threads, i.e. **inv ∈ [~17 BigInt-muls … ~50–80 f8-muls]**. The
design is insensitive to this: it only moves the affine↔jac crossover C
(≥2 if inv≈17-equiv, ≥6–8 if inv≈80-f8) — both inside the M2 sweep matrix.
If the sweep is ambiguous, add `op=mul&f8=1` to the microbench then.

- Batched-affine add: ~6 muls + inv/C (C = adds per inversion, forward
  prefix in registers / one inv / backward peel). Live set ≈ 4 field temps.
- Jacobian: mixed 7M+4S ≈ 11, jac+jac 11M+5S ≈ 16, dbl 2M+5S ≈ 7; ~10+ live
  field temps → occupancy cost on top.
- **Dispatch floors (measured per pass): ~105 µs M4, ~140 µs Adreno, ~540 µs
  Mali.** 35 → ~5 passes alone returns ~3.1 / ~4.2 / ~16.2 ms.
- Memory: tens of MB per reduce → ≤ ~1 ms everywhere; never binding. Strided
  chunk ownership (§4) keeps it coalesced.

Conclusions locked by the data: (1) batch-affine is the workhorse, Jacobian
only via the per-level toggle for narrow levels (`useJac`/T_SAT pattern,
z-init/jac-finalize bridges); (2) **k=1 is the default** — sacrificing
threads for batch size loses on every device (halving threads costs
~40–100% throughput; C 2→4 saves only ~30% ALU); k ∈ {2,4} stays in the
sweep for the pessimistic-inv scenario; (3) pass-count minimization is the
most robust win component, independent of the ALU uncertainty.

## 3. The algorithm: telescoped chunk_contribution ("fold tower")

### 3.1 One fold level

Split S_w = WS + PS, with WS = Σ j·V_j (0-based weights), PS = Σ V_j.

Partition window w's B slots into G **strided** chunks: chunk q owns slots
{ iG + q : i ∈ [0, M) }, M = B/G. (Strided, not contiguous: at step i,
chunks q and q+1 touch adjacent slots iG+q, iG+q+1 → coalesced loads; the
CPU uses contiguous slices because cache lines favour the opposite. Same
algebra either way.)

Per chunk compute, by one pass of the running-sum trick over its M slots:

    R_q = Σ_i V[iG+q]            (plain sum)
    Λ_q = Σ_i i·V[iG+q]          (row-weighted sum)

Writing j = iG + q:

    WS(V) = Σ_q Σ_i (iG+q)·V[iG+q] = G·PS(Λ) + WS(R)
    PS(V) = PS(R)

So one fold level reduces "WS+PS of B values" to "WS+PS of G values (the R's)
+ a PLAIN sum of G values (the Λ's), scaled by the constant G". The R-array
is the same problem one level smaller → recurse. Λ-arrays only ever need
plain sums, which fold along inside later levels at one add per slot.

### 3.2 The tower and the deferred lift

Apply levels ℓ = 0..r−1 with chunk counts G₀ > G₁ > … (M_ℓ = B_ℓ/G_ℓ,
B_{ℓ+1} = G_ℓ). Unrolling:

    S_w = WS(R^r) + PS(R^r) + Σ_{ℓ=1}^{r} G_{ℓ−1} · PS(Λ^ℓ)

Note the scale factors are the plain per-level G's, NOT cumulative products.
Worked check (B=4, G₀=2, M=2, V=[v0..v3], target 1v0+2v1+3v2+4v3):
level 0 → R¹=[v0+v2, v1+v3], Λ¹=[v2, v3];
level 1 (G₁=1) → R²=[v0+v1+v2+v3], Λ²=[v1+v3];
S = 0 + (v0+v1+v2+v3) + 2·(v2+v3) + 1·(v1+v3) = v0+2v1+3v2+4v3 ✓.

All G_ℓ are powers of two, so every scale is doublings — and they are applied
ONCE PER WINDOW PER LEVEL in the tail kernel (≤ log2(stride) = 12 doublings
each, on single points), not per chunk. This is `chunk_contribution`'s
`(lo−1)·R` lift, deferred and batched to the very end where it costs ~nothing.

This is exactly the CPU decomposition generalized: CPU = one fold level
(T chunks/window, contiguous) + per-chunk 4-phase + per-chunk double-and-add
lift + Stage-7 sum. GPU = several shallower fold levels (because we need
10–40k-wide chunks-in-flight, not 16), strided, with all lifts deferred.

### 3.3 Work accounting

Per fold level: 2 adds per input slot (alg += running; running += V), plus
1 add/slot per live Λ-stream being plain-summed. Total over the tower
≈ 2·NW·stride + (stream sums ≈ NW·G₀) ≈ 2.4 adds/bucket — the same total
work as today's 35-pass schedule (~193k adds at c=13/N=2^17), reorganized so
that (a) every add is batch-affine with C ≥ 4–8, (b) every dispatch is
10–40k threads wide, (c) there are 4–6 dispatches instead of 35.

## 4. Concrete schedule (c=13, NW=20, stride=4096 — the N=2^17 case)

Primary candidate ("T8"): M-tower (8, 8, 8) → B: 4096 → 512 → 64 → 8.

| dispatch | role | chunks NC | adds | threads (k=1 / 2 / 4) | C=2k/3k per inv | regime |
|---|---|---|---|---|---|---|
| K1 | fold ℓ=0 | NW·512 = 10,240 | 164k | 10,240 / 5,120 / 2,560 | 2 / 4 / 8 | affine |
| K2 | fold ℓ=1 (+Λ¹ stream) | NW·64 = 1,280 | ~31k | 1,280 / 640 | 3 / 6 | affine or jac — toggle |
| K3 | fold ℓ=2 (+2 streams) | NW·8 = 160 | ~6k | 160 | — | jac (toggle) — or merge into K4 |
| K4 | tail: WS+PS of 8 R³ + scale-and-add the 3 stream sums | NW workgroups | ~2k | 20×64 lanes | — | jac, one workgroup/window |
| K5 | existing `ba_reduce_jac_finalize` | — | NW invs | — | — | unchanged |

4–5 dispatches (K3 can merge into K4). Floors drop 35→~5: −2.6 ms Adreno,
−16 ms Mali of pure floor; no level runs below NW·G_last width until the
trivially-cheap tail.

`k` = chunks walked simultaneously per thread; each slot-step batches its
2–3 adds × k chunks through ONE inversion (registers permitting — §5). The
threads-vs-C trade is explicit and per-device:

- ALU-rich, occupancy-hungry (M4, Adreno): k=1–2 → 5–10k threads, C=2–4,
  ~13–21 montmul/add.
- ALU-poor, floor-heavy (Mali): k=2–4 → C=4–8, ~10–13.5 montmul/add at
  2.5–5k threads (still ≥ today's 2,560, with 30 fewer floors).

Wider-front variant ("T2-16"): prepend an M=2 level — an M=2 fold is a pure
pairwise add (R = V₀+V₁, Λ = copy V₁): 40,960 chunks → 40,960 one-add threads
at full coalescing, then tower (16, 16) on 2048: trades +1 dispatch for a
maximally wide first level. Candidate for M4/Adreno; reject on Mali (floor).
Both schedules are host-side tables consumed by the SAME kernel (per-level
uniforms, like today's `lparams`/`reduce_sched`), so this is a tuning matrix,
not divergent code paths.

Smaller c (small-n MSMs, split-c upper windows): same machinery, shorter
tower (stride 128 → (8,16) or single level + tail). Tower generation is a
pure function of (stride_w, device class) mirroring `buildReducePasses`; the
per-window schedule table keeps the existing "narrow windows no-op extra
levels" convention (`reduce_sched` row layout) so split-c needs no extra
dispatches — same property as today.

## 5. Kernel specs

### K_fold (`ba_reduce_fold.template.wgsl`) — the only new heavy kernel

One thread = k chunks of one fold level. Per-level uniforms:
(level ℓ, G, M, k, stream count, in/out slot bases per window via the
schedule table — reuse `reduce_sched`'s row[0].x base convention).

```
state per owned chunk c (k total):
    run_c : affine accumulator + present flag      (R running sum)
    alg_c : affine accumulator + present flag      (Λ running sum)
    str_c[s] : affine accumulator per live stream  (levels ≥ 1 only)

for i = M−1 .. 0:                       // strided walk, coalesced
    // candidates this step, all independent across (c, kind):
    //   alg_c += run_c          (weight advance; uses pre-update run_c)
    //   run_c += V[iG + q_c]    (is_present-guarded)
    //   str_c[s] += S_in[iG + q_c]                (levels ≥ 1)
    forward prefix-product of the 2k..3k real denominators
    one fr_inv_by_loop_pk
    backward peel, apply each add
write back (R_q, Λ_q, stream partials) as affine + present flags
```

- Identity/empty cases use the existing branchless select pattern of
  `ba_reduce_level_bench` (skip / copy-into-empty / real-add; denominator
  forced to R-one when not real). Collisions (P=±Q) remain assumed-absent —
  the same documented policy as both existing reduce kernels.
- Outputs are written in red_buf x/y planes + is_present at slots the level
  just consumed (in-place, like the CPU; no arena growth). Next level reads
  them exactly as it reads buckets — levels are uniform.
- Register budget: k=1 → 2 affine accumulators + 2-deep prefix ≈ 48–64
  u32 regs: safe everywhere. k=2 ≈ 96–128: likely fine on M4/Adreno. k=4:
  accumulators move to global scratch (red_buf slots; traffic is §2-small) —
  A/B in M2 decides regs-vs-global per device.
- Jacobian variant (`kind` switch or sibling template, mirroring today's
  `ba_reduce_level_jacobian`): same walk, jac accumulators in red_buf+red_z,
  no inversion. Selected per level by the SAME `useJac` mechanism
  (threshold on level width — re-derived T_SAT in M2), with the existing
  z-init / jac-finalize bridges. This preserves the toggle end-to-end.

### K_tail (`ba_reduce_tail.template.wgsl`)

One workgroup per window. Loads the final R^r triples + per-level stream
partials (≤ ~32 values), computes WS+PS over R^r (cooperative or
single-lane — trivial work), then S_w += Σ_ℓ G_{ℓ−1}·PS(Λ^ℓ) via doublings
(≤ 12 per level), writes the Jacobian root to the window's `reduce_sched`
base slot + red_z. K5 (`ba_reduce_jac_finalize`) then normalises — unchanged,
including the empty-window (0,0) sentinel and is_present re-stamp.

### Removed/retired

`buildReducePasses`' 35-level schedule, the per-level bind array, and
`reducePrefScratch` global prefix traffic (prefixes now live in registers).
Keep them compiled behind the fallback flag until M3 flips the default;
delete after soak.

## 6. Schedule width table — toggle placement (c=13 primary schedule)

| level | candidates/step-batch | threads (k=2) | affine C | regime by T_SAT |
|---|---|---|---|---|
| K1 ℓ=0 | 10,240 chunks × 2-add steps | 5,120 | 4 | affine |
| K2 ℓ=1 | 1,280 × 3 | 640 | 6 | borderline — toggle decides (likely affine on M4, jac on phones) |
| K3 ℓ=2 | 160 × 4 | 160 | — | jac |
| K4 tail | 20 × ~32 | 20 wg | — | jac |

The toggle is therefore not vestigial: it picks the crossover level per
device exactly as `useJac` does today, just over 3–4 levels instead of 35.

## 7. Correctness strategy

1. **Host reference implementation first** (TS, in `walker-validate` /
   a small unit around the schedule generator): implement the fold tower +
   deferred lift over bigint affine points; property-test S_w against the
   direct Σ(j+1)V_j for random sparse/dense V, all (stride, M-tower, k)
   combos including ragged split-c strides and all-empty / single-bucket
   windows. The §3.2 identity must be byte-exact before any WGSL exists.
2. Golden hashes (no-split, seed 12345): logN14 `255df40fb6007596`, 15
   `1ae5f73b51ce81fc`, 16 `f44181e584ddb91f`, 17 `1d13b4f68d91c67c`
   (SPARSE_REDUCE_HANDOFF.md — re-confirm on this branch before relying).
3. `?msm_dump=` real Chonk wires (`wire_n23074` → `0x59e9d999ef00fd22`),
   split-c forced config, logN 10–17 sweep vs the WASM oracle.
4. Edge cases called out for explicit tests: window with B_w=1; all-empty
   window; empty chunk (R=Λ=∞ propagates as not-present); Λ-copy path of an
   M=2 level; k > chunks-remaining ragged tail.

## 8. Milestones

Bench discipline: root CLAUDE.md `<msm_webgpu_benchmarking>` — bench-lock.sh
around every measurement (mac or phones); phones via
`profile_both.sh` (~2 min); mac = Chrome timestamps only.

- **M0 — calibrate (½ day).** Roofline microbench
  (`gen_roofline_microbench_shader`: mont_throughput + bandwidth) on M4 and
  once per phone; measure `fr_inv_by_loop_pk` montmul-equivalents on-device.
  Local `?autorun=msm-trace` rerun for an M4 per-pass baseline table.
  Output: filled-in cost model; pick of primary (M-tower, k) per device.
- **M1 — host reference + schedule generator (1 day).** §7.1 reference,
  tower generator (pure function of stride/device-class), unit tests green.
- **M2 — K_fold/K_tail implementation (2–3 days).** Behind
  `groupedReduce`/`?grouped_reduce=1` (mirror the `sparseReduce` flag
  pattern: config → pipeline compile → encode branch). Gates: §7.2–7.4 all
  green locally; then mac-lock A/B at logN 10–17. Sweep (M-tower, k,
  regs-vs-global, T_SAT crossover, WG) locally on M4.
- **M3 — phone validation (½–1 day).** One `profile_both.sh` per candidate
  schedule (≤ 3), phones lock. Accept: reduce subtotal ≥ 2.5× faster on both
  phones AND ≥ 1.5× on M4, goldens green. Flip default; keep
  `?grouped_reduce=0` escape hatch one release.
- **M4 — follow-ups, separately gated.** (a) Empty-bucket gap handling in
  K_fold's walk for structured production wires (the SPARSE_REDUCE goal —
  K_fold's per-chunk walk is v0's gap-aware loop, now batched); (b) re-tune
  `pickC`/`reduceCostWeight` — a ~3× cheaper reduce moves the optimal c up
  (c=14/15 at logN 16–17 cuts walker work ~7–13%): likely the largest
  total-time win after the phase win; (c) subgroup-cooperative inversion
  batching experiment (shuffle prefix-product) — only if M0 shows inversion
  still dominating at achievable C.

## 8b. M2 status (implemented; measured on M4)

Implemented behind `?grouped_reduce=1`: `ba_reduce_fold` (per-level batch-
affine, nstreams-specialised), `ba_reduce_fold_tail` (sequential, debug),
`ba_reduce_fold_coop_tail` (default tail), `fold_tower.ts` generator +
host reference, full msm_v2 wiring. Byte-identical to the dense tree at
logn 10–17 (historical goldens reproduced), forced mixed-width split-c, and
all tower variants.

M4 logn17 attribution (per run, msm-trace timestamps):

| shape | passes | per-pass ms | reduce total |
|---|---|---|---|
| dense (baseline) | 35 | sawtooth, floor ~0.105 | **6.18** |
| folds [8,8,8] + seq tail | 4 | 1.83 / 1.09 / 1.27 / 1.99 | 6.18 |
| fold [8] + coop tail (default) | 2 | 1.83 / 2.85 | **4.68** |
| fold [4,4] + coop | 3 | 1.64 / 0.78 / 2.83 | 5.25 |
| fold [16] + coop | 2 | 2.54 / 2.12 | 4.66 |
| folds [8,8] + coop(L=64) | 3 | 1.83 / 1.08 / 1.82 | 4.73 |

Two measured lessons:
1. **fold0 is at its inversion floor** (~1.6–1.8 ms): inversions = NW·stride
   regardless of shape (one per chunk-step), ≈ 1.4 M mul-eq at inv≈17. The
   f8 body outperforms the BigInt-rate model (effective ~1.25 M mul-eq/ms at
   10,240 threads). Raising C needs k>1 chunks/thread (halves threads) or a
   different identity — parked.
2. **Anything per-window-cooperative is latency-bound at NW=20 workgroups on
   M4**: the coop tail costs ~1.8–2.9 ms for ANY L ∈ [64, 1024] — scan work,
   identity-branch divergence, and dependent-add latency, not throughput.
   M4 lacks GPU counters (mac skill broken); the phone counters in M3 are
   the instrument for decomposing this.

M4 net: 6.18 → 4.68 ms (1.33×). The phone floors (35→3 passes ≈ −4.2 ms
Adreno / −16 ms Mali before any width effect) are the larger prize and do
not depend on the coop tail's exact cost.

## 9. Projections (M0-calibrated; M3 replaces with measurements)

M4 baseline refreshed in M0: whole-MSM wall 33.2 ms at logN=17; reduce
6.18 ms/run (20.8% of GPU time), 35 passes, floor ~105 µs — same shape as
the phones.

| | today (reduce) | floor savings (35→~5) | width effect on remaining work | projected |
|---|---|---|---|---|
| M4 | 6.18 ms | −3.1 ms | 2,560→10–20k threads ≈ 6× per-op | **~1.5–2.5 ms** |
| Adreno | 10.45 ms | −4.2 ms | 6.7× per-op headroom | **~2.5–4 ms** |
| Mali | 38.48 ms | −16.2 ms | ~5× per-op headroom; floor-dominated today | **~7–13 ms** |

Residual uncertainty: the f8-vs-BigInt inv ratio (§2) only shifts the
affine↔jac crossover; the floor and width components are measured.

## 10. Risks

- **Register pressure in K_fold** (k≥2 + prefix chain): mitigated by k as a
  tunable, global-accumulator fallback, and the fact that the affine adder's
  live set is small (§2). Checked via occupancy counters in the phone traces.
- **Λ-stream bookkeeping bugs**: the reason M1 builds the host reference
  before any WGSL; the schedule generator is shared host code, kernels are
  table-driven.
- **Tiny-n regressions**: small n picks small c (pickC: c=4–8 below 2^15) →
  short towers; if a size still regresses, keep the legacy dense path below
  a stride threshold via the same flag machinery (cheap, both paths exist).
- **Multi-batch (logN ≥ 18)**: reduce runs once over all windows after the
  batch loop — unchanged; tower covers all NW global windows like today.
- **pt_loop sawtooth** (0.9 ms Adreno / 9.0 ms Mali in the traces): same
  disease in the walker-combine machinery — out of scope, flagged to its
  owner; the fold-tower pattern applies there too.
