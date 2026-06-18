# WebGPU sumcheck — optimization analysis

Branch `sb/sumcheck-webgpu`. Two engines ship: **multi-pass** (CPU in the round loop, one
readback/round) and **single-submission** (whole protocol in one command buffer, Fiat–Shamir
on the GPU, one readback total). Both run the same `O(n)` math; see `DESIGN_REPORT.html` for the
stage-by-stage derivation.

**Measurement status.** This report was originally written with no GPU available — all claims
reasoned from operation counts and sync points. It has since been reconciled against a measured
sweep on **M4 Pro / Chrome (WebGPU over Metal)**, held in `DESIGN_REPORT.html`'s `PROFILE_DATA`
(re-run `drive.mjs bench/profile/ssprofile/wgsweep/hybrid` to refresh). Items below are tagged
**[MEASURED]** where the M4 data confirms or revises the original reasoning, and
**[NEEDS A/B BENCH]** where a code change is proposed but its delta is not yet isolated.

## This branch: single-submission *k*-round hybrid + parallel transcript

Two changes land here, both targeting the single-submission engine (the integration
target). Numbers below the fold are the pre-change M4 baseline; the new deltas are
tagged **[NEEDS M4 BENCH]** — re-run `LOGN=18 node drive.mjs sshybrid` (and the
`poseidon2` suite) on the M4 to fill them in.

1. **Single-submission GPU front of the first *k* rounds, then WASM tail** (new
   `runSingleSubmitHybridBenchmark`, default `k = 9`; engine: `runSingleSubmitSumcheck`
   now takes `maxRounds`). The heavy early rounds — round 0 is half the field work,
   each later round halves the rest, so `k = 9` captures ~99.8% of it — run in **one
   command buffer with on-GPU Poseidon2 Fiat-Shamir and no per-round CPU↔GPU
   round-trip**, then the folded `2^(d-k)` columns are handed to threaded WASM for the
   cheap small-hypercube tail (where the GPU is launch-bound). This is the
   single-submission analogue of the existing multi-pass hybrid, but the GPU front
   never blocks the host between rounds. New **SS-Hybrid** dashboard tab + `sshybrid`
   autorun target. The handoff readback (GPU→WASM columns) is timed separately.

2. **Lane-parallel Poseidon2 transcript** (new
   `poseidon2_transcript_par_test.template.wgsl`, `@workgroup_size(4)` — one thread per
   `t=4` state lane; wired into `makeTranscriptRunner` by default). Attacks lever #1
   below: the serial `@workgroup_size(1)` transcript was **27.3% of single-submit GPU
   time** (5.46 ms/round). The 8 full rounds (add_rc, s-box, external MDS) and the
   internal layer's 4 diagonal multiplies now run one lane per thread; the 56
   partial-round s-boxes stay serial on lane 0 (the inherent chain), so expect ~2×
   on the transcript, not 4×. The serial kernel is kept as the reference; the
   `poseidon2` suite now cross-checks **both** against the CPU Poseidon2.

3. **GPU-resident gate-separator scaling, now in single-submission too** (lever #2).
   `single_submit.ts` previously called the host `computeBetaProducts` (`O(n log n)`
   bigint) + a per-round `toMont` loop in `setupMs`. It now builds `beta_products` with
   the GPU doubling scan and gathers each round's strided slice in-buffer — the same
   kernels the multi-pass engine uses — so the front's `setupMs` no longer carries the
   host cliff that would otherwise swamp the `k`-round hybrid at `2^16–2^18`.

**Caveat:** the GPU work here was authored without a GPU in the loop; correctness
rests on the `poseidon2` and `singlesubmit` suites (GPU vs CPU reference) and `naga`
validation of the rendered WGSL. Run both suites on the M4 before trusting the new
challenges; the benchmark *timing* is valid regardless of challenge correctness.

## Executive summary

1. **WebGPU wins at scale.** [MEASURED] On the M4 Pro, WebGPU crosses parity with threaded WASM
   at `2^15` and reaches **1.6–2.2×** at `2^16–2^17` (e.g. `2^16`: multi-pass 307 ms vs WASM
   498 ms; `2^17`: 487 ms vs 1073 ms). Below `2^15` it is launch-overhead-bound and loses. The
   GPU's edge-parallelism beats WASM despite the emulated 254-bit multiply.
2. **Multi-pass is faster than single-submission up to `2^17`.** [MEASURED] The on-GPU Poseidon2
   transcript is **serial** (`@workgroup_size(1)`, 5.46 ms/round, **27.3%** of single-submit GPU
   time) and costs *more* than the per-round readbacks it was built to remove. So the engine that
   "never blocks the host" is the slower one at every size ≤ `2^17` (`2^17`: 487 ms multi-pass vs
   592 ms single-submit). The two engines cross only at `2^18`, where multi-pass hits its host
   cliff. Parallelizing the transcript is what makes single-submission the better engine
   everywhere, not just at `2^18`.
3. **Accumulate is the GPU.** [MEASURED] Round-0 GPU split at `2^16`: **85.6%** accumulate
   / 7.3% reduce / 7.1% fold. The GPU is doing real `O(n)` field work, not bookkeeping — so the
   field multiply, not data movement, is the remaining GPU lever. Hottest relations (measured):
   `perm` 9.63 ms, `pos2quad` 8.45, `databus` 7.08, `arith` 5.83, `pos2quadterm` 5.64,
   `logderiv` 5.24.
4. **The 2144 ms `2^14` wall was a measurement artifact — confirmed.** [MEASURED] It was the
   validation suite (`suite_singlesubmit.ts`) compiling the 14 accumulate kernels with
   `createComputePipelineAsync` *inside* the timed encode loop (no `shared`/warmup). The warmed
   bench path measures `ssWallMs` = **246 ms** at `2^14`, not 2144 ms — the ~1.9 s gap was cold
   Metal compilation and disappears with warmup. Not a prover cost.
5. **Occupancy is already tuned — not a lever on this device.** [MEASURED] The accumulate
   workgroup-size sweep is flat 32–128 (±4%): WG 64 = 230.9 ms is the optimum, only degrading past
   192 (WG 256 = 264 ms). The original report flagged this as "unknown, possibly 5–20%"; the M4
   data closes it. Kept below only so it is not re-investigated.
6. **The one host cost that does not amortize** is the multi-pass gate-separator scaling precompute
   (`computeBetaProducts` `O(n·log n)` bigint + per-round `toMont` `O(n)`), serial on the main
   thread. Likely cause of the multi-pass `2^18` blow-up (307 → 487 → 1993 ms over `2^16→18`).
   Single-submission already sidesteps it (GPU-resident `c_i`); porting that closes the cliff.
   *(That `2^18` row is variance-prone — the hybrid harness timed the same engine/size at 1027 ms,
   so treat 1993 ms as noise-inflated, not a stable figure.)*
7. **Memory, not time, is the production ceiling on a laptop.** [DERIVED] Resident ping-pong is
   ~1.5× the column set: ~2.7 GB at `2^18`, ~5.4 GB at `2^19`, ~10.8 GB at `2^20`. `2^20` is
   infeasible on an M4 Pro; `2^18` comfortable, `2^19` borderline.

## Prioritized optimization table

Ranked by measured impact. The top two are the engine-specific scaling failures; #3 is the only
remaining GPU compute lever.

| # | Area | Location | Mechanism | Impact | Risk | Fix |
|---|------|----------|-----------|--------|------|-----|
| 1 | **Serial Poseidon2 transcript** (single-submit) | `poseidon2_gpu.ts`; transcript kernel `@workgroup_size(1)` | One serial permutation chain per round on the batch→transcript→fold critical path | **[MEASURED] 27.3% of single-submit GPU time** (5.46 ms/round @ `2^16`); the single reason single-submit trails multi-pass at every size ≤ `2^17` | med | **DONE (this branch):** lane-parallel `poseidon2_transcript_par_test` (`@workgroup_size(4)`, one thread/lane) wired into `makeTranscriptRunner`; full-round MDS/sbox + internal diag multiplies vectorize across `t=4`, the 56 partial rounds stay serial (≈2× expected). **[NEEDS M4 A/B BENCH]** |
| 2 | **Gate-separator host cliff** | `gpu_pipeline.ts` (multi-pass) + `single_submit.ts` (single-submit) | `computeBetaProducts` `O(n·log n)` serial bigint + per-round `toMont` `O(n)` on the main thread | **[MEASURED]** plausibly the `2^18` multi-pass blow-up (1993 ms; variance-prone). The only host cost that grew with `n` | med | **DONE (both engines):** GPU doubling subset-product scan + per-round in-buffer strided gather (`gate_separator_scan`/`gather`). Multi-pass ported earlier; single-submit ported this branch — front `setupMs` no longer carries the cliff. **[NEEDS M4 A/B BENCH]** |
| 3 | **Emulated field multiply — no squaring** | `field8.template.wgsl:40-45`; sites `poseidon2_transcript…:98-100`, `mono.template…:68-79`, `lag.template…:lag_sqr`, elliptic `y²` | Every `x·x` goes through full `montgomery_product_f8`; no `montgomery_square_f8` | **[MEASURED-context]** accumulate is 85.6% of GPU time, this is its inner loop; a square saves the cross-term (~15–25% at those sites) → est. ~2–3% overall | low | Add `montgomery_square_f8`, route the squaring sites; quantify against the hot relations (`perm`/`pos2quad`/`databus`). **[NEEDS A/B BENCH]** |
| 4 | **Second readback** (single-submit) | `single_submit.ts:271-286` | Final length-1 columns use an extra `submit`+`mapAsync` despite "read back once" | ~1 GPU fence/round-trip per prove | low | `copyBufferToBuffer(cur[r], …)` into the SAME encoder + a longer staging buffer; one submit, one map. **[NEEDS A/B BENCH]** |
| 5 | **Build-once encode** (single-submit) | `single_submit.ts:207-250` | ~800 `create_and_write_ub`+`create_bind_group` per prove inside the loop | warmed: tens of ms; real win is build-once across many proves | med | Precompute all UBs/bind-groups in setup (contents are GPU-data-independent); ping-pong needs only 2 bind-group variants per (relation,kernel) by round parity. `u32x4(pairs)` at `:216` is identical for all 14 relations — collapse to one |
| 6 | **Memory ceiling** | resident colA/colB + perEdge scratch | Ping-pong is 1.5× the column set | **[DERIVED]** ~2.7 GB `2^18`, ~5.4 GB `2^19`, ~10.8 GB `2^20` (infeasible) | — | In-place fold (write half-size column into the front of the same buffer) cuts colB, buys ~one power of two; or column streaming |
| 7 | **Dense evaluation** (production only) | relation kernels | Every relation runs on every row, incl. selector = 0 | 0 vs the dense bench (WASM also benches dense); large in real circuits | med | Selector early-out / stream compaction (warp-divergence caveat). **Not a bench win** |
| 8 | ~~Accumulate occupancy~~ — **resolved, not a lever** | `gpu_pipeline.ts:174` (accWG); `bench.ts:397` `runWgSweep` | WG-size sensitivity | **[MEASURED] none** on the M4: 230.9 ms @ WG 64, flat 32–128 (±4%), degrades past 192 | — | Keep WG 64. The deeper `Lag`-into-registers (constant-index unroll → SROA) is a separate, risky path (silent-corruption naga can't catch) |
| 9 | **Cold pipeline compilation** — **measurement artifact, resolved** | `suite_singlesubmit.ts:60`; `single_submit.ts:180-194` | 14 `createComputePipelineAsync` awaited inside the timed loop when no `shared`/warmup passed | **[MEASURED]** ~1.9 s off the *suite's* `2^14` wall; **0 on the bench path** (warmed `ssWallMs` = 246 ms). Not a prover cost | none | Suite already diagnosed; give it a `shared` + warmup prove (mirror `bench.ts:151-175`) so its numbers match the bench |

## 1. The two engines, measured

The headline reframe from the M4 data: **the engine designed to never block the host is the
slower one** at every size up to `2^17`.

```
size    multi-pass   single-submit   WASM        WebGPU best ÷ WASM
2^14      152 ms        246 ms        117 ms      0.77×  (overhead-bound)
2^15      201 ms        301 ms        233 ms      1.16×  (parity crossed)
2^16      307 ms        389 ms        498 ms      1.62×
2^17      487 ms        592 ms       1073 ms      2.20×
2^18     1993 ms*      1353 ms       2175 ms      1.61×  (*multi-pass host cliff, noisy)
```

- **Single-submission's transcript is the cost.** Its GPU split (all rounds, `2^16`): accumulate
  176.6 ms, reduce 12.0, **batch 28.3, transcript 87.4 (27.3%)**, fold 10.2, barrier bubble 5.4.
  The transcript is not idle time — it is 5.46 ms/round of genuine serial work in the
  `@workgroup_size(1)` Poseidon2 permutation (≈3 perms × ~488 muls). Removing the per-round
  readbacks bought less than the serial hash cost, so single-submit lost the trade up to `2^17`.
  This is lever #1: parallelize the permutation (the full-round MDS/sbox layers vectorize across
  the `t=4` state; only the 56 partial rounds are inherently serial).
- **Multi-pass's cliff is on the host.** It is faster everywhere ≤ `2^17`, then jumps at `2^18`.
  The only per-prove host cost that scales with `n` is the gate-separator precompute (lever #2);
  single-submit avoids it by keeping `c_i` GPU-resident. The `2^18` figure is variance-prone
  (1993 ms in the sweep vs 1027 ms when the hybrid harness timed the same engine/size), so the
  cliff is real but its magnitude is unstable.
- **Fix either and the other's weak size is covered.** Parallel transcript → single-submission
  wins everywhere; GPU gate-separator → multi-pass loses its cliff. The integration target is
  single-submission (owns its Fiat–Shamir, drop-in for the C++ transcript), so lever #1 matters
  most for the production path.

## 2. GPU-side / WGSL audit

GPU compute is `O(n)`, correct, and — at production `n` — the real work, not overhead.

- **Accumulate dominates.** [MEASURED] 85.6% of round-0 GPU time at `2^16`. Per-edge it does
  ~1817 Montgomery muls (dense); halves each round, so round 0 dominates. The hottest relations
  are `perm`, `pos2quad`, `databus`, `arith`, `pos2quadterm`, `logderiv` — Poseidon2-heavy and
  databus-heavy, as expected.
- **No squaring primitive (lever #3).** `montgomery_product_f8` (`field8.template.wgsl:40-45`)
  unpacks 8→20×13, Karatsuba-multiplies, repacks. Every `x·x` uses it: `p2_sbox` (x²,x⁴),
  `mono_sqr_c/g` (c0=a0², c2=a1²), `lag_sqr`, elliptic `y²/x²`. A dedicated `montgomery_square_f8`
  saves the cross-term symmetry (~15–25% of a multiply). With pPow5 (x²→x⁴→x⁵) and Poseidon sbox
  heavy in the mix, the known ~2–3% overall lever. Low risk; validate with `naga` then M4.
- **Occupancy is fine where it matters.** [MEASURED] WG 64 is the device optimum; the sweep is
  flat 32–128. accumulate dispatches ceil(pairs/64) WGs (1 thread/edge), fold ceil(numOut/64)
  (thousands) — both `O(n)` kernels are well-utilized. reduce uses out_len≤90 of REDUCE_WG=128 —
  fine.
- **batch and transcript are poorly occupied but `O(1)` per round.** batch runs 8 of 64 lanes;
  transcript is `@workgroup_size(1)`. At large `n` batch (8.8%) vanishes next to accumulate, but
  transcript (27.3%) does *not* — see lever #1. Both sit on the serial
  batch→transcript→next-acc chain (the `c_buf` read-before-write hazard is auto-serialized), so
  they also bound late-round latency where `n` is tiny.
- **No redundant reductions.** `perEdge` scratch is reused across relations (passes serialize,
  safe); the two-level reduce writes one Fr/column into `accBuf`; batch reads `accBuf` once. Clean.
- **Selector-skip is ratio-neutral for the bench** (WASM benches dense too), but a large
  *production* win in real circuits where most selectors are 0 — subject to warp divergence.

## 3. Scaling model (k = log₂ n)

Active pairs in round i: m_i = n/2^(i+1); Σ m_i ≈ n.

| Component | Per-prove scaling | Notes |
|---|---|---|
| GPU accumulate | `O(n)·Σmuls` (≈1817 muls/edge dense) | **85.6% of GPU time [MEASURED]**; round 0 dominates |
| GPU fold | `O(n·185)` | 185 columns; round 0 dominates |
| GPU reduce | `O(n)` adds | 7.3% |
| GPU batch | `O(d)` constant/round | 8.8% single-submit; negligible at large n |
| GPU transcript (single-submit) | `O(d)` constant/round, **serial** | **27.3% [MEASURED]** — lever #1 |
| Host encode (warmed) | `O(R·log n)` | ~800→1160 buf/bg from `2^14`→`2^20`; amortizes |
| Host setup (β-products + scaling, multi-pass) | `O(n·log n)` serial bigint | the multi-pass `2^18` cliff — lever #2 |
| Host decode + readback | `O(d)` | tiny |

**Conclusion:** GPU compute (`O(n)`) dominates at production `n` and is the real work. Warmed host
overhead is `O(R·log n)` and amortizes — push to production `n` and stop optimizing it (once #4/#5
land). The non-amortizing exceptions are the serial transcript (`O(d)` but a large constant,
single-submit, #1) and the gate-separator precompute (`O(n·log n)`, multi-pass, #2).

**Memory ceiling (the real production limit on M4 Pro)** [DERIVED]: colA = 185·n·32, colB =
185·(n/2)·32, perEdge scratch = 90·(n/2)·32:

| k | colA | colB | perEdge | total | largest single buf (databus colA) |
|---|---|---|---|---|---|
| 14 | 0.10 GB | 0.05 | 0.02 | 0.17 GB | 13 MB |
| 16 | 0.39 | 0.19 | 0.09 | 0.68 GB | 50 MB |
| 18 | 1.55 | 0.78 | 0.38 | **2.71 GB** | 201 MB |
| 19 | 3.10 | 1.55 | 0.75 | **5.41 GB** | 403 MB |
| 20 | 6.21 | 3.10 | 1.51 | **10.82 GB** | 805 MB |

`2^20` (~11 GB) is infeasible on M4 Pro; **`2^18` (~2.7 GB) comfortable, `2^19` (~5.4 GB)
borderline.** Per-buffer stays under the requested `maxBufferSize`/`maxStorageBufferBindingSize`
well past `2^20`, so the binding constraint is total working set, not any single buffer. The
hybrid GPU-front/WASM-tail reduces *time*, not *memory* — early rounds still need full `n`
columns resident — so it does not lift this ceiling.

## 4. Design insights for the next phase

- **Single-submission is the integration target — but it needs lever #1 first.** It owns its
  Fiat–Shamir, the GPU Poseidon2 transcript matches bb.js `poseidon2Hash` bit-for-bit, and it
  never blocks the host. But it is the slower engine until the serial transcript is parallelized;
  that is the highest-leverage change for the production path.
- **Production single-submission = build-once, prove-many.** Make `runSingleSubmitSumcheck` take a
  fully-warmed engine handle (runners + accumulate cache + all UBs + the two parity-indexed
  bind-group sets precomputed for a given `n`). Per-prove work then = upload columns + encode
  (pure execute_pipeline/copy) + 1 submit + 1 map + `O(d)` decode. (#4 + #5.)
- **Move gate-separator scaling onto the GPU.** The only multi-pass host cost that scales with
  `n`. Subset-products are a doubling scan; `toMont` is embarrassingly parallel. Generating
  `scalBufs[i]`/`betaProducts` GPU-side keeps the host `O(d)` at all sizes (#2).
- **Memory, not latency, gates production `n` on a laptop.** Plan for column streaming or
  per-relation batching if `2^19+` is required, or target a higher-VRAM GPU. In-place fold buys
  ~one extra power of two.
- **Path to ZK (currently non-ZK Mega).** Libra masking adds a masking polynomial folded into
  `accBuf` before batch, one extra eval column in `li_mat`/`ld_mat` (`batch_gpu.ts`) and
  BATCHED_LEN (8→9), and the masking randomness committed into the GPU transcript. The
  single-command-buffer shape survives — extra constants + one wider univariate, not a new
  round-trip.
- **Integration into real `bb` chonk prove.** Feed witness columns already in Montgomery bytes
  (skip `encodeColumnsToBytes`), and return the final length-1 columns as the claimed multilinear
  evaluations consumed by the PCS/opening — which is exactly what the second readback (#4) already
  produces. The GPU-derived sumcheck challenges are drop-in for the C++ transcript provided the
  rest of the proof transcript (commitments etc.) is hashed consistently.

---
**Measurement note.** The headline findings (parity crossing, engine ranking, accumulate share,
WG-64 optimum, the cold-compile artifact) are now backed by the M4 Pro / Chrome sweep in
`DESIGN_REPORT.html`'s `PROFILE_DATA`. The proposed code changes (#1 transcript parallelization,
#2 GPU gate-separator, #3 `montgomery_square_f8`, #4 single readback, #5 build-once) are reasoned
from operation counts and sync points; each is tagged **[NEEDS A/B BENCH]** — measure the isolated
delta on the M4 before claiming its impact.
