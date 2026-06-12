# Bucket reduction — status report

> **Addendum 5 (halving reduction — SUPERSEDES the fold tower, 2026-06-11).**
> The fold tower below was a bastardisation of the Mitschabaude algorithm
> (per-thread running-sum recurrence ⇒ batch-2 disease, capped recursion,
> weight/sum tail). Rebuilt as the true halving recursion
> (`halving_reduce=1`, src/msm_webgpu/halving_reduce.ts + ba_halve /
> jac_halve / halve_finish_arrays / halve_finish_root): S(V over B) =
> S(bottom+top over B/2) + (B/2)·PS(top); carries spawn in place; every
> depth is independent pairs batched 8-per-thread while saturated, 4 to a
> floor, wide Jacobian once thin; a (window,array)-grid finisher folds the
> tail IN PLACE in global memory (zero workgroup memory) and the staged
> tree + jac→affine normalise share one final dispatch.
> M4 logn17: reduce 6.16 → ~3.2 ms kernel time, 35 → 11 dispatches;
> whole-MSM wall (uninstrumented, msm-matrix) 32.2 → **29.2 ms**. Golden at
> logn 10/12/14/17 and every knob shape; complete addition semantics
> throughout (the C++ try_filter_pair cases, branchless-cheap); op count
> 8,203/window vs the C++'s 8,625. Defaults: halveCap=64 (finisher chains
> scale with per-array length), ba4Floor=foldSat. Phones not yet measured
> (stop order; see CLAUDE.md phone_testing_safety). Lessons banked: tail
> dispatches are chain-latency + ~0.3-0.4 ms pass-floor bound — win by
> deleting passes and shortening chains, not by shared-memory shuffles.

> **Addendum 4 (config correction + coop verdict + N-adaptive kernels,
> 2026-06-10).**
> - **Config correction.** All previous PHONE numbers in this report were
>   captured with the karat montmul and forced per-pass profiling; the
>   canonical phone config (webgpu-gpu-trace runbook) is
>   `montmul=cios_unrolled&wordsize=13`. Under it, Adreno dense logn17 wall
>   = **94.2 ms** (vs 575.7 mis-configured). Phone-side regime conclusions
>   drawn from karat runs are void pending re-measurement; M4 results stand.
> - **Coop fold verdict** (`ba_reduce_fold_coop`, workgroup-batched
>   inversion): M4 fold0 1.88 ms — fastest variant, golden, latency-hiding
>   CONFIRMED on hardware with deep resident-workgroup capacity. On phones
>   it is fatal: Adreno compiles it (41 s) then **loses the device on the
>   first dispatch** (insufficient wave residency to hide the serial inverse
>   + barrier chain → watchdog); Mali grinds the driver into system-wide
>   memory pressure for 600 s at compile. Kernel stays M4-only behind
>   `fold_coop`.
> - **Thread-local tower** (`ba_reduce_fold_tlocal`, fold_tlocal knob):
>   L0 replacement, one thread folds its 8 points as an in-register binary
>   tower (R = ΣP, Λ = 4H+2Pr+O over bit-index subsets) — 5 rounds of
>   independent ops batching C = 6/4/3/2/1 per inversion, 16 ops, full
>   width, zero barriers, NO row loop (nothing for Mali's unroller to
>   unroll). Mali-viable combo: `fold_tlocal=1&fold_k=1`.
> - **Lean pair kernel** (`ba_reduce_fold_pair`): M = 2 levels = one
>   Jacobian add per thread at maximum width; Λ is a copy; compile-time
>   affine (6-montmul add) vs chained-jac variants. Serves the shapes
>   width-adaptive towers emit at small N.
> - **Width-adaptive towers** (buildFoldTower numWindows/satWidth): per
>   level, the largest M ∈ {2,4,8} keeping NW·(B/M) ≥ satWidth; M = 2 when
>   even that starves (small N → "Jacobian, 1 add per thread"). At c = 13 /
>   NW = 20 the default tower becomes [8,4,4] (L1 widens 1280 → 2560
>   threads). Oracle-tested across strides 64–4096. The mobile pipeline-creation
> failure is SOLVED as a diagnosis: a logcat tombstone during a failing
> `?autorun=probe&shader=jac` shows the Mali driver's shader compiler
> abort()ing OUT OF MEMORY inside its loop-unroll pass
> (`libGLES_mali.so: vkCreateComputePipelines → … → loop_unroll →
> dominfo_compute → _essl_mempool_alloc → Scudo "internal map failure" →
> abort`). The GPU-process crash is what surfaces as "A valid external
> Instance reference no longer exists"; when the allocator fails more
> gracefully the same compile returns VK_ERROR_INITIALIZATION_FAILED. This
> explains the previous "context/state-dependence": after one crash (or with
> many concurrent pipeline compiles) the process has less headroom and
> EVERYTHING fails; after the phone rebooted, per-kernel probing became
> deterministic. malioc accepts every kernel because it is a different
> frontend build with desktop memory.
>
> Captured Tint's actual SPIR-V on-device via
> `--enable-dawn-features=dump_shaders` + CDP console capture
> (`dev/msm-webgpu/capture-console.mjs`); Tint emits complete, ordinary
> SPIR-V (functions NOT inlined, Bound ≈ 4.3k) — the explosion happens
> entirely inside the driver after IT inlines everything into the one
> counted row-loop.
>
> **Empirical compile cliff on Mali** (isolation probes, fresh device):
> counted-loop bodies with ≤ 16 inlined montmuls compile (sum 4.8s,
> jac-stripped-to-run-only 5.1s); 23 compiles slowest (weight 7.9s);
> ≥ ~32 always dies (jac at ns=0/1/2 = 39/55/71, jac minus double = 32,
> branch-free jac, opaque-bound jac, and fold k=4 at every ns). fold k=1
> (C=2–4, ns=0/1/2) all compile — their row loops contain the DYNAMIC
> inversion loop, which the unroller refuses to unroll.
>
> Consequences: (1) a Mali-viable grouped path exists TODAY — force
> `fold_k=1` (affine all levels) + weight + two-pass sum; every kernel in
> it compiles in isolation. Next phone session: full-build identity + A/B
> vs the 38.5 ms dense baseline. (2) The jac kernel is M4-only until/unless
> it is split into sequential ≤16-montmul loops (run/stream sums split off;
> Λ as a direct j-weighted sum with a dynamic dbl-add inner loop — the
> noalg/ns=0 pass plus the weight kernel's pass make both halves
> individually proven shapes). (3) Pipeline compiles on Mali should be
> serialized or capped — concurrent compiles multiply peak compiler memory
> and reproduce the "everything fails" degraded state.

> **Addendum 2 (end-to-end rebuild, autonomous session).** The downstream
> stages were rebuilt around two measured facts: (1) C=2 batch-affine is
> never worth dispatching — each level now runs batch-affine with the
> largest k (chunks/thread, C = k·(2+streams) per inversion) that keeps
> threads ≥ foldSat, else an inversion-free barrier-less Jacobian fold;
> (2) at post-fold scale per-element weighting is cheap, so the scan-based
> combine died — `ba_reduce_fold_sum` weights each value directly and
> pair-tree-reduces per window as a STRUCTURAL CLONE of ba_fused_tail_coop
> (the one barrier kernel both phones build in every run). Every grouped
> kernel is now barrier-less or fused_tail-shaped. Default tower [8,8,4].
> M4 logn17: dense 6.18 → grouped 4.87 ms (fold0 1.91 / fold1 1.14 /
> fold2 0.64 / sum 1.18 / final 0.13), wall 34.5 → 33.5 ms, byte-identical
> at logn 7–17 + split-c + all knob variants. Bugs caught by the sweep and
> fixed loudly: 3-level towers silently dropping the third Λ-stream (now an
> assert + 3-stream support) and z-plane phantom lanes in the (now deleted)
> combine. Remaining: the phone compile/run of the sum kernel — the
> fused_tail-clone bet — plus per-device (fold_sat, fold_m) sweeps.

> **Addendum (later the same session — fold v2 + combine + forensics).**
> After the pause review the second phase was rebuilt and the fold kernel
> performance-audited (details in §A below; commits `377a0b18f5`,
> `57e81f0505`):
> - **Fold kernel v2** (audit fixes): apply-reorder kills the 16-register
>   running snapshot; V's y-load deferred past the inversion (peak-register
>   cut across the ~700-deep safegcd chain); if/else chains + Cand/Acc
>   structs replaced with flat selects; the two field-compare collision
>   probes replaced by one boolean (alg_dup). Verdict on the M4 shortfall:
>   fold0 is INVERSION-bound — one inversion per row amortised over only
>   C = 2 adds = ~68% of its ALU; the structural lever is k=2 chunks/thread
>   (C=4), not micro-fixes.
> - **Second phase rebuilt** as `ba_reduce_fold_combine`: one small
>   workgroup per window, suffix-scan + tree (Σ_t suffix_t = Σ (t+1)R_t),
>   COMPLETE branchless add. Root-caused tonight's wrong results: scan/tree
>   operands are nested suffix sums, equal exactly when a gap is empty —
>   structural P+P on sparse windows (the top Booth carry window always is);
>   the incomplete add silently emitted ∞. Pinned by a JS mirror test that
>   exercises the collision path. Byte-identical on M4 at logn 7–17 +
>   split-c.
> - **Mobile compile forensics** (single-shader probe harness,
>   `?autorun=probe&shader=…`): on Mali, fold0 builds alone; combine and
>   sparse fail alone; and ba_fused_tail_coop — which builds in EVERY full
>   MsmV2 run — ALSO fails alone under the app's exact device envelope and
>   explicit layouts. Pipeline creation on these drivers is
>   context/state-dependent; no deterministic construct to avoid. Next step:
>   converge the combine as a structural clone of fused_tail measured
>   IN-BUILD (~5 min/iteration on-phone), or pursue an Adreno-side
>   counter-trace once it reconnects.
> - M4 grouped reduce currently: 1.93 (fold0) + 1.15 (fold1) + 2.64
>   (combine, latency-floor-bound at 20 small workgroups) ≈ 5.7 ms vs 6.18
>   dense; M4 remains capped by the NW=20 combine latency wall regardless
>   of shape — the phone floors stay the real prize.

Branch `zw/optimise-reduction`, 2026-06-09. Requested by Zac after the phone
regression: what was done, what happens on the mac, what happens on the
phones, and analysis. Companion design doc: GROUPED_REDUCE_PLAN.md.

## 1. What was done

Goal: replace the 35-pass bucket-reduction sawtooth (one chunk = one whole
window, ≤ 2,560 threads, three geometric collapses) with a WebGPU-shaped port
of the CPU's Stage 6b + chunk_contribution: partition each window's bucket
space into many strided chunks, compute locally-weighted partial sums in wide
batch-affine dispatches, and recombine exactly via the telescoped identity

    S_w = WS(R^r) + PS(R^r) + Σ_ℓ G_ℓ·PS(Λ^{ℓ+1})        (weights deferred
    to powers-of-two scalings of per-level plain sums — the chunk_contribution
    lift, applied once per window at the end).

Delivered, in commit order:
1. `f653074a85` — plan + M0 calibration + `fold_tower.ts` (tower generator +
   exact bigint host reference, property-tested against the direct
   Σ(j+1)·V_j oracle: strides 1…4096, densities 0…1, ragged chunks, M=2
   copy-path, all-empty/single-bucket windows).
2. `5e2b6ac10b` — `ba_reduce_fold` (the workhorse: one fold level per
   dispatch on a (chunks × windows) grid; each thread walks one strided
   chunk keeping batch-affine accumulators in registers; the 2+streams adds
   of each row share ONE pk14 inversion via in-register prefix/peel; the
   structurally-colliding `alg += running` candidate is add/double/cancel-
   safe); `ba_reduce_fold_tail` (sequential per-window tail, debug);
   full msm_v2 wiring behind `?grouped_reduce=1` (fold_sched table,
   reduce_sched-shaped, split-c no-op rows; per-level binds; pass-count).
3. `90794b7b26` — `ba_reduce_fold_coop_tail`: one workgroup per window,
   per-lane Jacobian partials then shared-memory suffix-scan + tree sums
   (sum-of-suffixes = the (t+1)-weighted sum directly). Default tail; towers
   stop at L≈512 (one fold level at c=13).
4. `e1156eab42` — flat vec4 shared memory + 128 lanes (12 KiB) after the
   phone failures (kernel-quality changes, kept).
5. `40b8827044` — fallbacks removed per instruction (no UA sniff, no
   compile-failure degrade). `?fold_coop=0` remains as an explicit debug
   toggle only.

**Correctness (all on M4, deterministic seed 12345, GPU-vs-GPU + goldens):**
byte-identical to the dense tree at every logn 10–17 — logn14/15/16/17
reproduce the historical goldens (`255df40fb6007596`, `1ae5f73b51ce81fc`,
`f44181e584ddb91f`, `1d13b4f68d91c67c`) — under forced mixed-width split-c
(`forcesplit=192,8,4` → 8-bit and 4-bit windows, towers of different lengths
+ no-op schedule rows), and under five tower variants (`fold_m=4,4,4`,
`16,16`, `2,8,8`, `fold_tailmax=64`, `fold_m=4&fold_tailmax=4`), with both
tail kernels. The host reference and identity algebra are solid.

## 2. What happens on the mac (M4, logn17, c=13, NW=20, stride=4096)

M0 calibration first (BigInt-body montmul chains, pk14 inverse chains):

| threads | M4 montmul/ms | Adreno 830 | Mali G715 |
|---|---|---|---|
| 2,560 (= dense reduce width) | 144k | 68k | 22k |
| 10,240 | 874k | 252k | 40–57k |
| 40,960 / 65,536 | 1,180k | 458k | 113–126k |

pk14 inverse ≈ **17.5 / 17.5 / 13–16 montmul-equivalents** (M4/Adreno/Mali at
10,240 threads). Per-pass floors: ~105 / ~140 / ~540 µs.

Reduce-phase attribution (msm-trace timestamps, per warm run):

| config | passes | per-pass ms | reduce total | vs dense |
|---|---|---|---|---|
| dense (today's tree) | 35 | sawtooth, floor 0.105 | **6.18 ms** | — |
| folds [8,8,8] + seq tail | 4 | 1.83 / 1.09 / 1.27 / 1.99 | 6.18 ms | 1.00× |
| fold [8] + coop tail | 2 | 1.83 / 2.85 | **4.68 ms** | **1.33×** |
| folds [4,4] + coop | 3 | 1.64 / 0.78 / 2.83 | 5.25 ms | 1.18× |
| fold [16] + coop | 2 | 2.54 / 2.12 | 4.66 ms | 1.33× |
| folds [8,8] + coop(L=64) | 3 | 1.83 / 1.08 / 1.82 | 4.73 ms | 1.31× |

Whole-MSM wall: 34.4 → 34.2 ms (the reduce is ~20% of GPU time and the M4
wall carries ~4 ms of non-GPU slack, so a −1.5 ms GPU win barely moves wall).

Two structural facts measured:
- **fold0 is at its inversion floor and otherwise healthy.** Inversions are
  conserved at chunks×rows = NW·stride ≈ 82k ≈ 1.4 M montmul-equivalents
  whatever the tower shape; fold0's measured 1.6–1.8 ms implies an effective
  ~1.25 M mul-eq/ms — above the BigInt microbench rate (the f8 body is
  cheaper), i.e. the kernel is efficient. ~95% of all reduce work happens
  here at 10–20k threads. This part of the port is **good**.
- **Everything per-window-cooperative is latency-bound at NW=20
  workgroups.** The coop tail costs ~1.8–2.9 ms for ANY tail length
  L ∈ [64, 1024]; the sequential tail costs ~2.0 ms for a 32-value walk (20
  threads × ~50 µs per dependent Jacobian add). M4 simply will not run 20
  small workgroups fast, no matter how little work they hold.

## 3. What happens on the phones

Baselines (the provided N=2^17 traces): reduce = **10.45 ms** of 82.5 ms GPU
(Adreno S25+), **38.48 ms** of 248.4 ms GPU (Mali 9A); ~20 of 35 passes sit
at the per-pass floor (~140 / ~540 µs).

What I measured tonight (wireless adb, content_shell, port 5224):

1. **Coop-tail config (the M4 winner): hard failure on BOTH phones.**
   `GPUPipelineError: A valid external Instance reference no longer exists`
   during MsmV2 pipeline build — Adreno after ~110 s of compiling (the new
   pipelines take ~80–100 s there), Mali after ~37 s. Reproduced 3× on
   Adreno. Ruled out by experiment: workgroup-storage size (failed at 24 KiB
   AND 12 KiB, both ≤ the 32 KiB the app requests), nested
   `array<array<u32,8>>` shared arrays (failed after the flat-vec4 rewrite).
   Not yet isolated: code-size/complexity (the kernel inlines ~8
   `jac_add_safe` sites × ~16 montmuls each on top of the ~115 KB shader
   prelude — a separate compile-time analysis already flags MsmV2's 43
   pipelines × giant prelude), barrier-in-loop/function structure, or a
   cumulative compile watchdog. logcat captured nothing conclusive (buffer
   noise).
2. **Seq-tail config (folds [8,8,8] + sequential tail) runs on Adreno but
   REGRESSES wall: 956 ms vs 756 ms baseline (+26%).** (Uncaptured
   wall-around-submit, same harness both sides, reps=3.) No per-pass GPU
   attribution exists yet for this run — the trace captures failed (see
   below) — but the regression is consistent with §2's latency analysis:
   fold1 (1,280 threads), fold2 (160), and the 20-thread sequential tail are
   each multi-ms-scale on a chip whose per-op rate at those widths is 4–7×
   worse than saturated, plausibly exceeding the entire 10.45 ms dense
   reduce.
3. **Mali: no completed grouped measurement.** Its half of the capture
   produced no results row and an unlabeled trace fragment.
4. Capture-infrastructure failures burned most of the phone session: the
   SRS IndexedDB cache is per-origin so port 5224 cold-fetched ~70 MB over
   wireless adb (blowing the default capture caps); one capture ran against
   mid-edit dev-server state (vite serves fresh modules per load); the Mali
   labeling needed flags my warm-up launcher overwrote; and my lock keepalive
   process was reaped once, leaving the phones lock clear while a capture
   ran (one of my early runs also raced another agent's mac lock — both
   protocol violations are mine, noted for transparency).

## 4. Analysis

**What is proven.** The algorithm itself is right: the telescoped
chunk_contribution identity is exact (host-reference property tests +
byte-identical GPU results everywhere including split-c), and the batch-affine
fold kernel — the part carrying ~95% of the work — is efficient, wide, and
runs on all three devices. The 35-pass → ~3-pass restructuring removes
2.8–16 ms of pure pass-floor overhead per device.

**What is not solved: the last 5% of work — combining ~10k per-chunk partials
into 20 per-window roots.** This stage has an intrinsic parallelism cliff
(NW=20 windows), and the three shapes tried each fail differently:
- sequential per-window tail: latency disaster everywhere (≈2 ms M4, worse
  on phones — the likely cause of the Adreno +26%);
- deeper fold levels: dispatch widths collapse (1,280 → 160 chunks) into the
  same latency regime;
- workgroup-cooperative tail: the right shape on paper AND the measured M4
  winner, but both mobile Vulkan drivers refuse to build the pipeline.

**Why I believe the mobile failure is tractable.** It is a pipeline-creation
failure, not a runtime wrong-answer; Metal compiles the identical WGSL; and
the failure survived the two most obvious culprits (shared-memory size,
nested arrays), pointing at compiler code-size/structure limits that have
known levers: collapsing the ~8 inlined add sites to 1–2 via a phase-table
loop, moving the per-lane partial phase into the (already-compiling) fold
kernel, compiling the coop pipeline in isolation to separate per-kernel
failure from cumulative-build watchdogs, and getting a real driver error out
of logcat with proper GPU-process filtering. None of this was attempted yet —
the pause landed first, and fallbacks (degrade-to-seq, UA-gating) are
rejected per instruction and have been reverted (`40b8827044`).

**The honest scorecard against the win condition** (greatly improve reduce on
M4 + Adreno + Mali):

| | dense today | grouped today | verdict |
|---|---|---|---|
| M4 | 6.18 ms | 4.68 ms (coop) | +1.33× — real but short of the 2.5–4× projection, because the combine stage eats the fold savings |
| Adreno | 10.45 ms reduce / 756 ms wall | wall 956 ms (seq config) | **regression** — pause criterion met |
| Mali | 38.48 ms reduce | unmeasured (coop won't build; seq not yet measured) | unknown; floors alone promise −16 ms if the combine is fixed |

## 5. Options from here (my ranking)

A. **Make the coop kernel build on mobile** (recommended first: bounded,
   diagnosable). Steps: minimal-harness compile of the single kernel on each
   phone (isolates kernel-vs-cumulative-build); proper logcat/VK_EXT error
   capture; then restructure for compiler size — one add site driven by a
   constant phase table, per-lane partials moved into fold0's epilogue,
   smaller prelude (the compile-time analysis work is converging on the same
   target). Success here likely recovers the M4-shape win on phones plus
   their much larger floor savings.
B. **Different combine algorithm with ≥2k-wide dispatches end-to-end**: e.g.
   a cross-window fold whose chunks span all windows' partial arrays
   (10,240 → 1,280 → 160 values in two wide passes), with the per-window
   weighted assembly done by 160 threads reading a precomputed
   (window, weight) table — keeps every dispatch ≥1,280 wide and uses only
   fold-kernel-shaped code that already compiles on the phones. More design
   work, no driver unknowns.
C. **Hybrid**: fold0 + the legacy dense 4-phase schedule on the L=512
   arrays (proven kernels, ~26 passes at stride 512) — kills the Adreno
   latency tail but re-pays ~26 Mali floors (~14 ms); probably only worth it
   as a stopgap measurement vehicle, not a destination.

Until one of these lands, `groupedReduce` stays opt-in (`?grouped_reduce=1`)
and the dense tree remains the default — nothing on the default path changed.

## 6. Reproduction crib

- M4 identity: `?coi=1&autorun=msm-cross-check&logn=14&scalar_seed=12345
  [&grouped_reduce=1]` via `dev/msm-webgpu/drive-persist.mjs` (compare
  `[gpu] x=`).
- M4 per-pass: `?autorun=msm-trace&logn=17&reps=3&scalar_seed=12345
  [&grouped_reduce=1[&fold_coop=0][&fold_m=…]]` via `drive-passtimes.mjs`.
- Phone wall: `/tmp/phone-bench-once.sh <serial> 5224 "<msm-bench URL>"
  <results.jsonl>` (uncaptured), rows in
  `barretenberg/ts/fastbench_results_5224.jsonl`.
- Phone failure repro: any grouped URL without `fold_coop=0` on either
  phone → GPUPipelineError during “building MsmV2”.
- All measurements under `bench-lock.sh` (mac/phones).
