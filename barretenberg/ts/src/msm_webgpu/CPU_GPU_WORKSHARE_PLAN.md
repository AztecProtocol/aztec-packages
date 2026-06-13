# CPU + GPU MSM work-sharing — calibration & split design

Goal: a fast (<1 s, first-visit) bb.js calibration call that (1) picks the montmul
variant, (2) picks the optimal limb radix R, (3) fits a CPU-vs-GPU MSM cost model;
then a `Commit` / `BatchCommit` that splits each MSM across CPU and GPU to minimise
wall-time.

This document is the spec. The data it builds on is `msm-cpu-vs-gpu.csv` /
`MSM_CPU_VS_GPU_REPORT.md` (491 real MSMs from an ECDSA-r1 transfer Chonk prove on
an M4 Pro, each timed solo on CPU and on GPU).

---

## 0. The reframing that drives everything

The naive model — "the GPU is `r×` faster, so give it `r/(1+r)` of the points" —
is wrong in two ways that the measured data makes unavoidable:

1. **The winner is set by CPU work (scalar density), not by `n`.** The native
   Pippenger skips zero scalars, so its cost tracks the **number of non-zeros**
   `nnz`, not `n`. The GPU is dense `O(n)`. So the *same* `n=131071` is a CPU win
   when sparse (range-constraint poly, `nnz` tiny, CPU 7 ms) and a GPU win when
   dense (`Z_PERM`, CPU 138 ms). The split ratio is therefore **per-MSM**, and a
   function of `nnz`, not a single global constant.

2. **The GPU has a hard per-dispatch floor (~4–17 ms solo).** Below ~15 ms of CPU
   work the GPU can never win. Routing *everything* to the GPU (4871 ms) is **worse
   than all-CPU** (3663 ms). The oracle — route only the ~16 % of MSMs that are
   dense-and-large — is **2181 ms (−40 %)**. The union path amortises the floor
   across a pack, which is why batched small MSMs do better than the solo floor.

So `BatchCommit` is not "split every MSM by a ratio". It is **one global CPU/GPU
load-balancing problem**: keep the sparse/small MSMs on CPU (where they're nearly
free), put the dense/large ones on GPU, run both engines **concurrently**, and use
the CPU's idle tail to take *split-off slices* of the GPU-bound MSMs until the two
engines finish at the same time.

A model fit to the CSV reproduces the report's crossover, which validates the
approach:

```
t_cpu(nnz) ≈ 1.0e-3 · nnz           ms      (A_cpu ≈ 1.0 µs / non-zero)
t_gpu(n)   ≈ 3.5e-4 · n + 8         ms      (A_gpu ≈ 0.35 µs / point, B_gpu ≈ 8 ms floor)
crossover (dense, nnz=n):  6.5e-4·n = 8  →  n ≈ 12 300,  CPU ≈ 16 ms   ✓ matches "dense wins above ~16k", "crossover at CPU 15–20 ms"
```

In the dense regime the GPU is ≈ `A_cpu/A_gpu ≈ 2.9×` faster *per element* — that is
the real `r`, and it only applies once both fixed costs are paid.

---

## 1. What to measure (the calibration)

Two cost models, four coefficients, plus two discrete choices:

| symbol | meaning | how measured |
|---|---|---|
| `A_cpu` | ms per non-zero scalar (native Pippenger slope) | time `bb_native_pippenger` at 2–3 small **dense** sizes, fit slope |
| `B_cpu` | per-MSM CPU fixed cost | intercept of the same fit (small) |
| `A_gpu` | ms per point (GPU dense slope) | time `MsmV2.run` at 2–3 warm sizes, fit slope |
| `B_gpu` | per-dispatch GPU floor (solo) | intercept of the same fit |
| `B_gpu_union` | **shared** floor when many MSMs ride one union dispatch | one union dispatch of K members; ≈ floor / K amortised |
| `montmul` | `karat` \| `cios_unrolled` | adapter-vendor prior, confirmed by a small real-pipeline A/B |
| `R` | montgomery limb radix (bits/limb) | adapter-vendor prior + micro-bench (see §1.3) |

### 1.1 CPU fit — reuse existing exports
`bb_native_pippenger_bn254_load(points, scalars, n)` + timed
`bb_native_pippenger_bn254_run(threads, result)` already exist (they produced the
CSV). Time `n ∈ {2^10, 2^12, 2^14}` with **dense** scalars (so `nnz = n`), 2 reps
each, drop the first. Fit `t = A_cpu·n + B_cpu` by least squares. Stay small: a
2^14 dense CPU MSM is ~20 ms in wasm; 2^17 would be ~150 ms and blow the budget.
Pippenger is slightly sublinear (`n/log n`), so extrapolating a 2^10–2^14 slope to
2^17 *over*-estimates CPU cost by a few % — acceptable, and conservative (it biases
us to keep a little more on the GPU).

### 1.2 GPU fit — piggyback on warm-up
The app already compiles + warms the MSM pipeline on load (`[gpu-warm] MsmV2
ready`). Warm at **two** sizes we'll actually fit from (e.g. `2^14`, `2^17`) and
time those warm runs — the GPU fit is then nearly free. `t = A_gpu·n + B_gpu`. A
third point (`2^12`) tightens `B_gpu` if the budget allows. Also do **one** union
dispatch of ~8 equal small members to get `B_gpu_union` (the amortised floor) — the
batch planner needs it.

### 1.3 montmul (Part 1) and R (Part 2)
Both are GPU-microarchitecture properties (int32-mul throughput, register
pressure). The **adapter vendor/architecture string is the primary, near-free
signal** and already encodes the known answer:

- Apple / Metal → `karat` (high-register grouped Karatsuba+Yuval).
- Qualcomm/Adreno, ARM/Mali → `cios_unrolled` (register-lean; wins via *spill
  elimination* in `stream_walker`, 382→99 ms on Adreno 830).

The win is a **spill/occupancy effect in the real walker**, not isolated-montmul
speed — so an isolated montmul chain can mis-predict it. Confirm the prior with a
**small real-pipeline A/B** (an MSM at `n≈2^12` under each variant, pick the faster
wall), not a synthetic montmul loop. Only the loser's pipeline compile is wasted.

`R` (the montgomery limb radix — the `B16/B18/B20/B22` axis in
`experiments/fp-montmul`, vs the shipped int 20×13) is the representation choice.
The production MSM is currently fixed at 13-bit; the larger-limb / FP32 float-limb
paths are **not wired into `MsmV2`** yet. The calibration **measures what is wired**
and falls back to the vendor prior for `R`; the framework is generic over a
`{montmul, R}` variant so wiring a new radix later is a config change, not a
rewrite. (FLAG for review: confirm `R` == limb radix; if it means the reduction
finisher depth instead, the same sweep-and-pick harness applies — only the knob
changes.)

### 1.4 Budget & caching
Target < 1 s on M4 *excluding the unavoidable shader compile* (we must compile the
MSM shaders to use the GPU at all; the calibration piggybacks on that warm-up).
Order of cost: one extra pipeline compile for the montmul A/B loser (the dominant
term) + ~150 ms CPU fit + ~150 ms GPU fit. Persist the result keyed by the adapter
string (`vendor/arch/device`) in IndexedDB; first visit pays it, later visits read
the cache. If any measurement looks degenerate (non-monotone, negative slope, huge
variance), **fall back to all-CPU** (the safe engine) and mark the calibration
`untrusted` — never let a bad first-visit calibration make the prover slower.

---

## 2. Single `Commit` split

Given one MSM of size `n` with `nnz` non-zeros (count is an O(n) scan, sub-ms, or a
prover density hint):

```
t_cpu = A_cpu·nnz + B_cpu
t_gpu = A_gpu·n   + B_gpu
```

Balance point (run both concurrently, equalise finish times). The CPU slice keeps
the same density `ρ = nnz/n`, so a CPU slice of `n_c` points costs `A_cpu·ρ·n_c`:

```
A_cpu·ρ·n_c + B_cpu = A_gpu·n_g + B_gpu ,   n_c + n_g = n
n_g = (A_cpu·ρ·n + B_gpu − B_cpu) / (A_cpu·ρ + A_gpu)      (clamp to [0, n])
makespan = A_gpu·n_g + B_gpu  + ε_combine
```

Split **iff** `makespan < min(t_cpu, t_gpu) − margin`. Otherwise run wholly on the
better engine. Consequences that fall out correctly:
- **sparse** (`ρ→0`): `n_g→` small, CPU does almost everything → all-CPU. ✓
- **small** (`n` below where `A·n` beats the `B` floors): no split → all-CPU. ✓
- **large dense**: `n_g/n → A_cpu/(A_cpu+A_gpu) ≈ 0.74` → GPU 74 %, CPU 26 %.
  E.g. `Z_PERM` n=131071: CPU-only 138, GPU-only 48, **split ≈ 36 ms**. ✓

Combine = **one EC addition** of the two partial commitments (CPU partial + GPU
partial). Negligible.

---

## 3. `BatchCommit` split — marginal-benefit greedy + boundary split

A batch is `K` MSMs `(n_i, nnz_i)`. Model the two engines:

```
CPU is sequential across MSMs (each Pippenger is already internally multi-threaded):
    C = Σ_{i∈CPU} (A_cpu·nnz_i + B_cpu)
GPU packs its set into ONE union dispatch (shared floor):
    G = B_gpu_union + A_gpu · Σ_{i∈GPU} n_i
makespan = max(C, G)            (+ ε for the combines)
```

Algorithm (this is the continuous-relaxation makespan optimum; one split suffices):

```
1.  cpu_i      = A_cpu·nnz_i + B_cpu          // density-aware
    gpu_marg_i = A_gpu·n_i                    // dense marginal on the union
    Δ_i        = cpu_i − gpu_marg_i           // CPU time saved − GPU time added by moving i to GPU
2.  start: everything on CPU.   C = Σ cpu_i ,   G = B_gpu_union
3.  sort MSMs by Δ_i descending (densest/largest first — these are the GPU-favourable ones).
4.  while C > G and the next MSM has Δ > 0:
        move it CPU→GPU:   C −= cpu_i ;   G += gpu_marg_i
5.  // now C and G straddle. SPLIT the boundary MSM j (a dense, high-Δ one) by a
    // fraction f of its points to the GPU to make C == G exactly:
    //   solve  (C_without_j + (1−f)·cpu_j)  =  (G_without_j + f·gpu_marg_j)
    f* = clamp( (C_without_j − G_without_j + cpu_j) / (cpu_j + gpu_marg_j), 0, 1 )
6.  makespan = max(C, G).  Dispatch the GPU set (union) and the CPU set CONCURRENTLY.
    Combine the one split MSM's two partials (1 EC add).
```

Why this is right, not just a heuristic:
- With a single divisible job we can always hit `C = G` exactly, and `max(C,G)` is
  minimised at `C = G`. Sorting by `Δ` (efficiency) fills the GPU with the elements
  it's most efficient at first — the LP optimum for divisible load on two machines.
- We **only ever split one MSM**, and by sort order it is dense (`ρ≈1`), so the
  split is clean (its CPU slice cost really is `A_cpu·slice`, no density surprise)
  and there's exactly one extra EC-add of combine cost.
- Sparse MSMs have `Δ_i < 0` (GPU floor/marginal exceeds their tiny CPU cost) and
  never move — they stay on CPU, matching the oracle.

Refinements worth keeping in mind (not v1):
- The union has a **saturation capacity**; if `Σ n_i` on the GPU exceeds one
  saturating dispatch, `B_gpu_union` becomes `k · floor` for `k` dispatches — fold
  that into `G` as a step function if large batches appear.
- `B_cpu·|CPU set|` shifts slightly as MSMs move; recompute `C` exactly in the loop
  (cheap, K is small) rather than treating `B_cpu` as fixed.

---

## 4. Orchestration — two stages

### 4a. Calibrated routing (BUILT — serial, the −40 % oracle, default-off)

The high-value, low-risk half: replace the `n ≥ threshold` size gate with a per-MSM
**cost-model decision** — route MSM `i` to the GPU iff `t_gpu(n) < t_cpu(nnz_i)`.
This is the oracle (sparse→CPU, dense→GPU) and captures the −40 %, serially. It is
**correctness-safe by construction**: it only chooses between two engines that
already produce byte-identical commitments (the prior union `vks_match=true`).

Built this session:
- `bb_set_msm_split_model(coeffs_le, enabled)` WASM_EXPORT (`webgpu_msm_hook.cpp`):
  takes 5 LE f64 `[A_cpu, B_cpu, A_gpu, B_gpu, B_union]` + an enable flag. Compiles +
  links into `barretenberg.wasm`; export verified in the table.
- `route_to_gpu_by_model(n, scalars)` in the hook's route loop: `t_gpu(n) <
  t_cpu(nnz)`, skipping the O(n) non-zero scan when the GPU loses even at full
  density. `nnz` counted from the scalars already in hand.
- `serializeMsmModel(cal)` (`calibration.ts`): packs the 5 LE f64 (unit-tested).
- **Default-off**: with no model pushed, the hook is byte-identical to the validated
  size-gate path. Enabling it (JS pushes a model) is gated on `vks_match`.

**Enable-gate (not yet run):** `chonk_browser_webgpu_bench.test.ts` `vks_match=true`
with the model pushed + enabled. Because both engines are already validated, this is
a no-crash / routing-works smoke-test, not a correctness risk.

### 4b. CPU/GPU overlap + per-MSM split (SPEC — the work-sharing, default-off flag)

Today the hook is **serial**: CPU-routed MSMs run inline, *then* one **blocking**
`bb_external_batch_msm_bn254`. So makespan is `C + G`, not `max(C, G)`. The threading
supports overlap — the WASM prover worker posts over a SharedArrayBuffer and
`Atomics.wait`s while a **separate host thread** drives the GPU — so the worker just
has to **defer its wait** and do CPU work in between. The pieces:

1. **Async import ABI** (`worker_stub.ts`, `protocol.ts`): split the batch import
   into `…_start` (post, return) and `…_await` (wait, read results).
2. **C++ reorder + split** (`webgpu_msm_hook.cpp`): build the GPU batch (incl. each
   split MSM's `n_g`-point slice) → `…_start()` → run all CPU work inline (whole-CPU
   MSMs + each split MSM's `n_c`-point slice via `MSM::msm`) overlapping the GPU →
   `…_await()` → EC-add each split MSM's two partials. The planner (`msm_split_planner.hpp`)
   produces the routing + the one boundary split.

**The correctness hazard that makes 4b a careful job — the WASM-memory-grow race.**
Today the worker is *blocked* during the GPU dispatch (the union runner relies on
"worker can't grow/detach memory while we read its bytes", `main.ts` ~L890). With
overlap the worker runs Pippenger concurrently, which `malloc`s — and a
`memory.grow` **replaces the SharedArrayBuffer**, invalidating the host's views of
the descriptors/scalars/results. The fix is a **3-state handshake** so the host only
touches WASM memory while the worker is blocked:

```
worker _start : STATE=REQUEST; post; Atomics.wait until STATE==INPUTS_COPIED; return
host  on REQUEST: snapshot ALL inputs out of WASM → STATE=INPUTS_COPIED; notify;
                  then run the GPU compute async, holding results host-side
worker         : (returns from _start) runs CPU Pippenger — may grow memory; host
                  is NOT touching WASM in this window
worker _await : STATE=AWAITING; notify; Atomics.wait until STATE==DONE
host          : after GPU done AND STATE==AWAITING (waitAsync/poll on the main
                  thread): re-acquire a FRESH wasm view, write results → STATE=DONE
```

Both host↔WASM windows (read inputs, write results) occur while the worker is
blocked; the GPU compute touches no WASM. Get this subtly wrong → **intermittent
wrong proofs**, which only surface under the slow wasm+chonk loop (~10 min/iter). So
4b lands behind a **default-off `bb_set_msm_worksharing_enabled` flag** and is not
trusted until `vks_match` is green across repeated runs.

---

## 5. Build order

- **A. Calibration module** (`calibration.ts`, bb.js) — §1. Pure measurement, no
  C++ changes, locally validatable on M4. Returns `MsmCalibration`, cached by
  adapter. **← start here.**
- **B. Split planner** (`split_planner.ts`, pure function + unit tests) — §2/§3.
  The spec + reference for the C++ port; testable with no GPU.
- **C. Orchestration** (§4) — async import ABI + C++ overlap + model setter, behind
  a flag, validated against the chonk gate.

`A` and `B` are the contained, high-confidence pieces and come first; `C` is the
slow-to-validate integration and is gated.

---

## 6. Validation status

**Built + validated (this session):**
- `calibration.ts` — runs end-to-end on real M4 Metal (`?autorun=msm-calibrate`).
  montmul A/B picks `karat` on Apple (12.1 vs 12.6 ms, matches the prior); GPU fit
  is tight (predicts 44.8 ms @ 2^17, measured 44.73). 12 unit tests (incl. the
  `serializeMsmModel` ABI round-trip).
- `split_planner.ts` (TS, 11 tests) + `msm_split_planner.hpp` (C++ port, 11 gtests
  in `ecc_tests`, built + passing) — cross-language identical. Invariants: `makespan
  ≤ min(all-CPU, all-GPU)`, density-aware routing, Z_PERM splitting to ≈40 ms.
- **§4a calibrated routing** — `bb_set_msm_split_model` export + cost-model routing
  in `webgpu_msm_hook.cpp`. Compiles + links into `barretenberg.wasm` (export
  verified in the table); default-off; correctness-safe by construction. Enable-gate
  (`vks_match` with model on) not yet run.

**Budget (per the rule "compile time excluded"):** the *measurement* takes
**~0.8 s** on M4 (CPU fit + a few warm GPU runs); shader compile is **~0.5 s** more
but the warm-up pays it regardless, so production folds it in. The A/B-skip on a
known vendor removes the loser's compile.

**Known caveats (calibration robustness):**
- The CPU fit's *slope* is stable (~2.1–2.5 µs/non-zero on M4) but the *intercept*
  is inflated by per-call thread-pool dispatch + in-browser contention (a 1024-pt
  MSM mis-times at ~5–10 ms). It runs ≈2–2.5× the historical batched-prove rate
  (~1.0 µs/nnz). Bias is conservative (over-routes to GPU). Real production CPU
  timing should ride the warm prove pool, not isolated `_run` calls.
- Under heavy background CPU load the whole model inflates and varies run-to-run.
  `trusted` only catches degenerate fits (negative slope, <2 samples), **not** high
  variance — a quiet first-visit, min-of-more-reps, or cache-and-refine-on-revisit
  is the mitigation. The safe fallback when untrusted is all-CPU.

**Not yet done:**
- **§4a enable-gate** — run `chonk_browser_webgpu_bench.test.ts` with the model
  pushed + enabled, assert `vks_match=true` (a no-crash smoke-test; both engines are
  already validated). Needs the wasm-deploy + webpack + chonk loop.
- **§4b overlap + per-MSM split** — the async ABI + C++ reorder + the WASM-memory
  handshake (§4b above). The genuinely subtle part; behind a default-off flag,
  untrusted until repeated `vks_match` is green. The C++ planner is ready; the
  handshake protocol is the careful work.
