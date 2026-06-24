# Roadmap — WebGPU MSM Integration

Ordered by what unlocks the most useful next thing. Each entry has a binary
acceptance criterion so we can tell when it's done; reorder freely as
priorities shift, but don't delete completed entries — they're a record of
what was tried.

The performance levers (M4, M5, M6) are lifted from Zac's
[WEBGPU_CHONK_STATUS.md](../WEBGPU_CHONK_STATUS.md) "what it would take to
actually win" — restated here so the roadmap reads end-to-end without
hopping documents.

---

## M0 — Tracking scaffolding in place ✅

*Done 2026-05-25.* Created `integration/` directory with README, STATUS,
ALGORITHM, ROADMAP, CHANGELOG. No code changes.

---

## M1 — Reproduce Zac's measurements locally

**Why first.** Every later milestone is judged against a number. We need a
trustworthy baseline on our own hardware before any change we make can be
called a win or a regression.

**Acceptance criteria** (all three):
1. The dev-page sweep ([dev/msm-webgpu/](../../../dev/msm-webgpu/))
   runs end-to-end and produces a result table covering
   `n ∈ {2¹⁶, 2¹⁸, 2²⁰}` for WebGPU, WASM-1t, WASM-Nt.
2. The Chonk browser bench
   ([yarn-project/ivc-integration/src/chonk_browser_webgpu_bench.test.ts](../../../../../yarn-project/ivc-integration/src/chonk_browser_webgpu_bench.test.ts))
   passes locally with `vks_match = true`.
3. Numbers + hardware spec written into CHANGELOG.md as our baseline.

**Risks.** WebGPU adapter quirks per OS/browser/driver. Cross-origin
isolation (COOP/COEP) for SharedArrayBuffer. Toolchain mismatch between
this branch and our local bb.js build.

---

## M2 — Fill in ALGORITHM.md sections 1–7 ✅

*Done 2026-05-25.* All seven sections written as per-kernel reference
cards (bind group, dispatch shape, template params, I/O layout, math
summary) with cross-links back to [FLOW.md](FLOW.md) for narrative and
worked examples. Filed in one document edit rather than seven commits —
the acceptance criterion ("input/output layout, the math, the WGSL
file(s)") is met section-by-section regardless of commit cadence.

**What changed in scope along the way.**

- §8 (Memory levers) and §9 (Bridge protocol) left as stubs — they
  weren't in M2's "1–7" call-out, and §8 is genuinely better
  written *while* doing one of the lever changes (M4) than ahead of it.
- §1 ended up covering both the `convert_points_only` shader and the
  C++ adaptive-doubling host policy, because the GPU dispatch alone
  doesn't make sense without the prefix lifecycle that decides what
  gets dispatched.

---

## M3 — Pick the first performance lever

[WEBGPU_CHONK_STATUS.md](../WEBGPU_CHONK_STATUS.md) names three levers,
but one has been overtaken by events since the doc was written. Updated
table:

| Lever | Status | Original (Zac's) estimate | Effort |
|---|---|---|---|
| Multi-MSM-per-instance pool (K instances per N, round-robin same-N batches) | **Tried and reverted.** [bridge/main.ts:525-537](../bridge/main.ts#L525-L537) records the experiment: routes same-N MSMs through distinct instances to share one command buffer, but pays ~80–100 ms per fresh instance × ~30 extra slots ≈ ~3 s upfront, and the GPU still runs passes within a single command buffer sequentially. **Net regression: 0.78× → 0.58×.** Vestigial `slotPools` field + `getOrCreateMsmSlot` helper remain in the code but are dead. | (5–15% hoped) | Done; cost > benefit |
| Multi-MSM concurrent shaders (one dispatch over M MSMs in parallel, indexed by `(msm_idx, point_idx, window)`) | Not started. The reverted experiment confirmed this is the real lever — multiple single-MSM-shader instances ≠ multi-MSM-per-shader. | 3–6× on same-N batches; could flip end-to-end positive | Large (kernel rewrite) |
| Async commits in C++ (defer commit reads so the GPU pipelines across batches) | Not started. Touches commit-key + prover stages, not just MSM. | Amortizes per-batch overhead; not modelled | Architectural |

**Acceptance criteria for M3 itself.** A short decision note in
CHANGELOG.md explaining which of the *two remaining* levers we picked
and why, given (a) our M1 baseline numbers, (b) our calendar, (c) what's
in flight on Zac's side.

---

## M4 — Multi-MSM concurrent shaders

*Conditional on M3 selecting this one.* The reverted slot-pool
experiment (see M3) confirmed that multiple single-MSM-shader instances
do not parallelize same-N batches on the GPU — only multi-MSM-per-shader
does. This is the only structural lever left in MSM kernels themselves.

**Acceptance criteria.**
1. Pair-tree kernels accept an `(msm_idx, point_idx, window)` indexing.
2. Bridge issues a single dispatch for M same-N MSMs.
3. Same-N-of-10 chonk batch (`CONCATENATED_RANGE_CONSTRAINTS_*`,
   `ORDERED_RANGE_CONSTRAINTS_*` at `n=131_071`) drops from
   `10 × ~30 ms` serial to a measured "M-fused" time; recorded in
   CHANGELOG.md.
4. VK byte-match still holds.

---

## M5 — Async commits in C++

*Conditional on M3 selecting this one — and likely depends on someone with
prover-stage context, not just MSM context.*

**Acceptance criteria.** *(To define when we get here — probably needs a
scoping conversation with whoever owns the commit-key path.)*

---

## M6 — Cross-vendor validation

**Why.** The `Adreno-safe bucket+sign pack` commit (`e0337c3515`) suggests
that not every kernel is portable. We should know our test surface before
chasing perf on a single vendor.

**Acceptance criteria.**
1. Chonk e2e bench passes on at least one non-Apple GPU (NVIDIA discrete,
   Intel integrated, or Adreno).
2. Any vendor-specific known issues documented in STATUS.md.

---

## M8 — Recover the `fused` SLC-eviction regression

*Conditional on the GPU bucket-histogram path being in tree (landed
2026-05-26). See [STATUS.md](STATUS.md) "Known performance regression"
for the measurement.* The default GPU-histogram path costs ~15 ms (10%)
on the `fused` pass at n=2²⁰ vs the bypass (`?hostHist=1`). Net e2e is
still ~140 ms positive per MSM, but recovering the 15 ms would push the
trade further.

**Acceptance criteria** (any one):
1. The `?hostHist=1` A/B Δ on `fused` at n=2²⁰ drops below 3 ms (i.e.
   GPU-histogram path lands within noise of host-histogram). 40-rep
   median, M4 Pro Chromium.
2. Equivalent reduction observed on at least one non-Apple device (per
   M6 cross-vendor validation).

**Three approaches in order of preference.**

| Approach | Sketch | Effort | Notes |
|---|---|---|---|
| Static upper-bound plan | Use the closed-form `s_{k+1} ≤ floor(2/3·s_k)` recurrence to compute per-level pair/carry/stride upper bounds; drop the histogram dispatch + prepare-time mapAsync entirely | Medium — needs root-causing the n=2²⁰ "value is not invertible" failure from the previous attempt | Largest win — eliminates the cache thrash AND the prepare-time round-trip. The actual counts get computed at run-time via the existing `csr2v2_meta` → `countsBufs[0]` path. |
| Workgroup-shared histogram | Each workgroup atomic-adds into its own shared-memory histogram; one final write per `(wg, w, b)` reduces to global counts | Small — single-kernel rewrite | Cuts the 2 MB atomic-write streaming to ~256 KB; the 32 MB scalar read is unavoidable. Modest gain, low risk. |
| Cache warm-up dispatch | After the histogram readback, issue a tiny compute pass that reads the first ~16 MB of `point_x`/`point_y` to repopulate SLC before `fused` submits | Small but fragile | Costs GPU bandwidth (~2-3 ms) in exchange for hoping to recover ~10-15 ms. Highly device-tunable; reach for last. |

**Risks.**
- The static plan failed at n=2²⁰ with "value is not invertible" — root
  cause was never isolated. The failure mode looks like the affine-add
  hits a same-x pair, which the pad-trio should prevent. Could be an
  off-by-one in the wstride calculation or an interaction with the
  fast-path's OVERSIZE_FACTOR padding.
- Workgroup-shared histogram requires the bucket index (≤ 2¹⁵ at c=16)
  to fit in workgroup shared memory (≤ 32 KiB on Apple). At c=16 that's
  ~128 KiB of counters per workgroup — too big. Would need to split by
  window-batch or use a hash-and-resolve scheme. Slightly more complex
  than the one-line description suggests.

---

## M7 — Upstream PR

**Acceptance criteria.**
1. Branch rebased onto `merge-train/barretenberg` (or whatever the target
   branch is at that point).
2. `ci-barretenberg` (and likely `ci-barretenberg-full`) labels applied
   and green.
3. Stale docs in the parent directory either updated or moved to an
   `archive/` subdirectory with a clear marker.
4. Single PR description that explains the win, the test surface, and
   the known limitations from STATUS.md (point-at-infinity, etc.).

---

## Out of scope (explicit)

Listing here so we don't get pulled in by accident:

- **GLV / endomorphism** — `MSM_DESIGN_ANALYSIS.md §6.4` floats this as a
  large lever but it's a re-architecture, not an integration task.
- **Browser-multi-GPU** — not exposed by `navigator.gpu`. (Per the same
  doc, §6.8.)
- **WASM SIMD on the bb.js side** — orthogonal to GPU work; C++ team
  territory.
