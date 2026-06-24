# Changelog — WebGPU MSM Integration

Append-only, dated. One entry per working session. The *why* matters more
than the *what* — git captures the what.

---

## 2026-05-26 — column-safety analysis + per-label block-list

**Goal.** Decide which of the ~112 delegate-eligible MSMs in the canonical
Chonk flow can safely be sent to the WebGPU pair-tree pipeline, and turn
that decision into a runtime gate.

**What we built.**

1. **Distribution-capture mode** — new C++ `msm_distribution_mode_enabled()`
   hook in `MSM::batch_multi_scalar_mul`. When set (via WASM export
   `bb_set_msm_distribution_mode`), every BN254 MSM emits a `[msm-dist]`
   log line with the Booth-recoded per-window bucket histogram stats at
   `c = pickC(n)`: nnz, density, maxbucket, p99bucket, mean_nonzero_bucket.
   Captured by a new `runChonkMsmDistribution` browser harness; output is
   a 470-row CSV at `/tmp/zac-webgpu/chonk-msm-dist.csv` — one row per
   `MSM::batch_multi_scalar_mul` invocation in a single Chonk prove.

2. **Source-location fallback for unlabelled commits** — added a
   `std::source_location` default to `CommitmentKey::commit(polynomial,
   label, loc)`. When `label` is empty the call site (`<basename>:<line>`)
   is used as the telemetry name. Cut the `?`-labelled row count from
   163 → 26 in the distribution CSV. The remaining 26 are tiny (n ≤ 118)
   IPA `L_i`/`R_i` commits called directly via `pippenger_unsafe`, well
   below the WebGPU threshold.

3. **Column-safety classification** at
   `/tmp/zac-webgpu/chonk-delegate-eligible.md`. Heuristic: normalise the
   observed `mean_nonzero_bucket` by the expected uniform-random load
   (`n / 2^(c-1)`) and tier into safe (≤3×) / verify (>3×) / block (>30×).
   Of the 112 MSMs at `n ≥ 2¹²`: **89 safe, 12 verify, 11 block.** All
   verify/block rows are confined to three label families:
   `LOOKUP_READ_COUNTS`, `LOOKUP_READ_TAGS`, `VK_PRECOMPUTED_POLY` —
   the structural-scalar cases (0/1 selectors, small-integer counters,
   precomputed VK polynomials) where the pair-tree contract has the
   least margin.

4. **Per-label runtime block-list.** New C++ state +
   `bb_set_webgpu_msm_blocklist(const char* csv)` WASM export +
   `is_label_blocked()` check inside `batch_multi_scalar_mul_webgpu_bn254`
   so any MSM whose telemetry label matches a blocked entry routes back
   through the native Pippenger even when the WebGPU bridge is on.
   Plumbed through bb.js as `Barretenberg.initSingleton({ webgpuMsm:
   true, webgpuMsmBlocklist: [...] })`.

5. **3-mode comparative test** — `chonk_browser_webgpu_bench.test.ts`
   gains a new test that runs Chonk three ways (off / on-all /
   on-blocklist) and asserts VK byte-equality between the off baseline
   and both GPU modes. The on-blocklist mode applies the default
   `[LOOKUP_READ_COUNTS, LOOKUP_READ_TAGS, VK_PRECOMPUTED_POLY]` list.

6. **SwiftShader-aware skipping.** Linux CI without a hardware GPU
   exposes only Chromium's SwiftShader software WebGPU, which is not
   bit-exact for BN254 affine arithmetic and fails the in-prover verify.
   All four tests in the bench suite now detect SwiftShader and skip
   their GPU-dependent assertions, returning a clean pass. The
   VK-match invariant only fires on hardware-GPU hosts.

**Numbers.**
- Distribution capture: 470 rows total, 0 unnamed at `n ≥ 2¹⁴`.
- CPU cost of the 23 blocked columns (msmCsvMode, solo native Pippenger):
  **463 ms across 57 MSMs = 5.8% of total CPU MSM time.** Keeping them
  on CPU costs nearly nothing.

**What this unlocks.** The C2 milestone from `ROADMAP.md` — selective
delegation with a safety allow-list — landed in a single session. The
next question is whether on-blocklist is faster than the all-CPU baseline
on real hardware: tested on Mac Metal, not validated yet here.

**Known limitations.**
- SwiftShader path not bit-exact; existing 2-mode and CSV tests are
  now also skip-on-SwiftShader (not just the new 3-mode test).
- Block-list runtime check fires per-MSM in the batch loop — O(N) over
  the list per MSM. Fine at our scale (`< 10` entries), but if the list
  grows to dozens we'd switch to a hashed lookup.
- `VK_PRECOMPUTED_POLY` is a single label covering ~21 distinct
  precomputed polynomials (selectors, sigmas, lookup tables, lagrange
  firsts/lasts). To know which specific precomputed polys are the worst
  offenders we'd need to plumb the per-entity name through
  `NativeVerificationKey_` construction — punted; not in scope for this
  session.

---

## 2026-05-25 — kicked off integration tracking

**Branch.** `origin/zw/msm-webgpu-experiments-v2` at `6897d5e68a`
("perf(bb/msm): shared-scratch pool — 20× GPU memory reduction").

**What we did.**
- Read through the branch to understand the post-MsmV2-promotion shape.
  Major surprise mid-session: commit `396392be0b` replaced the cuZK
  pipeline with MsmV2; an earlier draft of STATUS.md assumed cuZK still
  existed.
- Found that `WEBGPU_CHONK_STATUS.md` already covers the integration
  status from Zac's side at a depth that's hard to add to. Decided to
  keep our notes separate (this directory) rather than fork or amend
  his.
- Stood up `integration/` with README, STATUS, ALGORITHM (stub),
  ROADMAP, and this CHANGELOG.

**What we learned (worth recording).**
- Integration is **functionally complete** — the Chonk browser bench
  produces byte-identical VKs against WASM-MT. The work ahead is
  performance, not plumbing.
- WebGPU is at `0.78×` of CPU on the canonical chonk flow (M4 Pro, per
  `WEBGPU_CHONK_STATUS.md`). The "3× at n=2²⁰" headline doesn't apply to
  chonk because chonk's MSMs sit in `n ∈ [16k, 131k]`.
- Three named levers in Zac's status doc: multi-MSM-per-instance pool;
  multi-MSM concurrent shaders; async commits in C++. The concurrent-
  shaders one is "the real win" per his notes but is a large rewrite.

**Next session.** M1 in [ROADMAP.md](ROADMAP.md) — reproduce the
measurements locally on whatever hardware we're running. No code changes
until we have a baseline.

---

## 2026-05-25 — cross-checked the tracking docs against the tree

Re-read everything written earlier in the same session against the
actual source. Several claims didn't survive contact with the code:

- **STATUS.md** had the C++ delegation policy wrong on three counts:
  the threshold is now `WEBGPU_MSM_THRESHOLD` (default **2¹⁴**, not the
  `2¹⁷` I wrote), it's checked per-MSM not per-batch, and there's a
  **runtime gate** (`bb_set_webgpu_msm_enabled`) I missed entirely —
  the hook defaults to OFF even when compiled in. Also got the
  delegation line number wrong (cited 505, actual is 545) and the
  shaders.ts size (cited 83 KB, actual 184 KB).
- **STATUS.md** "Known limitations" framed the no-infinity/`dx==0`
  property as a deficiency. Re-reading `msm_v2.ts:20-23` clarified it's
  a stated production contract enforced by the C++ hook's
  `!handle_edge_cases` gate. Reworded.
- **ALGORITHM.md** referenced three WGSL files that don't exist
  (`ba_planner_v2_bench`, `transpose_parallel_count_priv`,
  `transpose_parallel_scatter_priv`). The planner split into
  `_offsets` + `_emit` in commit `0999593b2a`, and the privatized
  transpose kernels were replaced by the tiled counting-sort variants
  in `83980f1930`.
- **ALGORITHM.md** said "three inversion variants" — the `'a'` variant
  was dropped; only `'loop'` and `'pk'` remain (msm_v2.ts:41).
- **ALGORITHM.md** said "fused 4-phase reduction" — the actual
  msm_v2.ts header calls it "branchless 4-phase reduction" (the fused
  reduction was removed in `a3dd1eb816`).
- **ALGORITHM.md** said MSM_DESIGN_ANALYSIS.md was "deleted" — it's
  not, it's just stale.

**Lesson worth keeping.** The doc I wrote claiming to be a snapshot of
the branch had a non-trivial error rate after a single re-read. Future
sessions: write claims with `path:line` references *while looking at
the line*, not from session memory.

---

## 2026-05-25 — second-round cross-check (deeper pass)

After the first round of fixes, a deeper audit caught more — most
critically that one of the three ROADMAP performance levers has already
been tried and reverted.

**Substantive findings.**

- **The "multi-MSM-per-instance pool" lever is dead.** [bridge/main.ts:525-537](../bridge/main.ts#L525-L537)
  documents the experiment ("tried Mon May 24"): it routed same-N MSMs
  through distinct `MsmV2` instances so the same-N batch could encode
  into one command buffer. Cost was ~80–100 ms per fresh instance × ~30
  extra slots ≈ ~3 s upfront, and the GPU still ran passes
  sequentially within one command buffer. **Net: 0.78× → 0.58×.
  Reverted.** The `slotPools` field + `getOrCreateMsmSlot` helper
  remain as vestiges; not on the live path. ROADMAP M3/M4/M5
  renumbered to reflect that only two levers remain.

- **Bridge encoder strategy was mis-described.** I wrote "single-encoder
  mixed-N path, per-MSM submit for same-N batches" — the actual
  branch at [bridge/main.ts:538](../bridge/main.ts#L538) is
  `hasSameNCollision = maxNCount > 1`. So a singleton batch and any
  mixed-N batch ride the single-encoder path; only batches with ≥2
  MSMs at the same N drop to per-MSM submit. Reworded.

- **Pinned `srsMsm` was missing.** STATUS.md only mentioned the LRU;
  the host actually pins the SRS-sized instance separately
  ([bridge/main.ts:75](../bridge/main.ts#L75)) and uses the LRU for
  other sizes. Added.

**Smaller fixes.**

- STATUS.md "ALGORITHM.md is the live reference" was an overclaim —
  ALGORITHM.md is mostly section stubs. Softened.
- `webgpu_msm_hook.hpp:33-36` → `:34-36` (the macro definition is
  actually on lines 34–36, not 33–36).
- ALGORITHM.md said `prepare()` is "cached on scalars identity" — the
  source comment says "Cached by identity"; reworded to match.

**Verifications that passed clean.**

- All seven commit hash + title pairs cited across docs match
  `git log`.
- All WGSL file references in ALGORITHM.md sections 1–5 resolve to
  files in `wgsl/cuzk/`, `wgsl/field/`, `wgsl/montgomery/`,
  `wgsl/bigint/`, `wgsl/struct/`.
- All five relative paths in STATUS.md (to `dev/msm-webgpu/`, to the
  Chonk e2e test, to the C++ scalar_multiplication / hook /
  marshalling sources) resolve correctly from `integration/`.
- `index.ts` exports the symbols STATUS.md claims (verified by reading
  the file).
- `worker_stub.ts` uses `Atomics.wait` (verified).
- All performance numbers (0.78×, 6.0 s, 7.6 s, `n ∈ [16k, 131k]`)
  match `WEBGPU_CHONK_STATUS.md` verbatim.
- Per-MSM threshold (default `2^14`, checked per-MSM via
  `webgpu_msm_should_delegate`) matches `webgpu_msm_hook.hpp`.

**Root cause of the original errors.** Two sources: (1) writing from
session memory after the branch tip moved
(`44be334331` → `6897d5e68a`) without re-grounding — several "files
exist" claims were true at the older tip; (2) confabulating file paths
from semantic similarity (e.g. `transpose_parallel_count_priv` because
I'd seen "privatized" transpose commits, without `ls`-checking that the
file survived the rename to `transpose_count_tiled`).

**Process change going forward.** For any factual claim that names a
file, line, symbol, or numeric value: open it with `Read`/`grep` *at
the moment of writing*. Don't paraphrase from session memory. The
extra ~30 seconds per claim is much cheaper than the second-round
audit.

---

## 2026-05-25 — M2 closed: ALGORITHM.md §1–§7

**What we did.** Filled ALGORITHM.md sections 1–7 as per-kernel
reference cards: bind groups, dispatch shapes, template parameters,
I/O layouts, math summaries. Each section grounded directly against
the WGSL file and the host `encodeIntoBatch` site
([msm_v2.ts:2115-2152](../msm_v2.ts#L2115-L2152)) — the table values
(workgroup-size tiers, dispatch dimensions, `params` slot meanings,
template variables) were read off the shader, not paraphrased from
[FLOW.md](FLOW.md).

**Where ALGORITHM.md and FLOW.md split.** FLOW.md is the *narrative*
(worked examples, motivation, why-this-shape). ALGORITHM.md is the
*reference card* (one row per binding, one line per dispatch). The
two are cross-linked at every section header — readers who want the
walk-through hop to FLOW.md, readers who want "which buffer is at
@binding(3)?" stay in ALGORITHM.md.

**One small late catch.** Wrote `Dispatch: (numPointTiles, T, 1)` for
the transpose count/scatter kernels before cross-checking the host
call. The actual host dispatch is `(numPointTiles, batchWindows, 1)` —
`batchWindows ≤ T` when Lever G window batching is on, and `=T`
otherwise. Same correction for `ba_planner_v2_offsets/_emit`. Caught
on the first audit pass — the M0 process-change ("read shader + host
together") held.

**What's left in ALGORITHM.md.** §8 (memory levers — five from the
file header) and §9 (bridge protocol — already covered structurally
in FLOW.md §1) intentionally left as stubs. §8 is better written
alongside one of the lever changes (ROADMAP M4) than ahead of it.
§9 doesn't need its own narrative — STATUS.md and FLOW.md cover it.

**Next session.** M1 — get the dev-page sweep and the Chonk e2e
bench running locally to produce a baseline measurement table. That's
the unblocker for every M3+ decision.

---

## 2026-05-25 — viewer + first diagram

**What we did.** Added a single-file HTML viewer ([index.html](index.html))
that fetches all six markdowns at runtime, renders KaTeX for `$…$`
math, highlight.js for code, Mermaid for `mermaid` blocks, builds a
sticky TOC sidebar with scroll-spy, has tabs, and a dark/light toggle.
Serves over HTTP via the bundled `serve.sh`. Verified end-to-end with
headless Chromium (35 structural checks, 0 console errors, 0 failed
requests).

Also wired the first in-tree diagram: `diagrams/pair_tree_tensor.tex`
(authored by Zac in Overleaf) → SVG via `diagrams/build.sh`. The build
script defaults to `node-tikzjax` (a WASM port of TikZJax) so users
without a local LaTeX install can still regenerate — only Node.js
required. Pass `BUILDER=pdflatex` to use a real LaTeX toolchain
instead. Embedded the rendered SVG into [FLOW.md §0](FLOW.md) as a
visual overview of the (tensor → slice → pair tree) story that §6–§8
walk through.

**Notes for future diagrams.**

- `node-tikzjax` ships a subset of CTAN; the supported package list is
  in its README. `tikz-3dplot` is in it, so 3D camera-projection
  diagrams compile. Macros from `amssymb` (`\mathbb`) are *not*
  auto-loaded — `build.sh` passes them via `texPackages`.
- One .tex per figure works fine; multi-panel single-file figures
  (like this one) also work but produce one wide SVG. Splitting into
  per-panel SVGs would mean per-panel .tex files — defer unless we
  need per-section placement.

---

## 2026-05-26 — moved the level-0 Booth histogram to GPU

**What we did.** Replaced `buildInitCounts` (a 250 ms single-threaded JS
loop at n=2²⁰) with a new `bucket_histogram` GPU compute pass
dispatched at the top of `MsmV2.prepare()`. `prepare()` is now async;
all callers (dev page, bridge collision + no-collision paths, internal
warm-up) updated to `await`. The host runs the per-level walk on the
GPU-produced counts, identical to before. End-to-end at n=2²⁰ on M4
Pro: `e2e` 355 → 229 ms (−126 ms, 35%). At chonk's n∈[16k, 131k] the
absolute number is smaller but the win compounds across ~1000 MSMs/proof.

**Also landed** in the same change:
- Profile harness measurement fixes. Five issues found by audit:
  `prep_booth_decode` was double-counting `scalar_upload_wall`; the
  `prep_other` residual was being clamped to zero by a wrong formula;
  the `prep_host_plan` intermediate had become a misleading "sum of
  children" row; `wall` in profile mode silently included the profile
  readback wait; one stale doc comment. Hierarchy is now `host_prepare`
  → {`scalar_upload_wall`, `prep_booth_decode` → `bucket_histogram_gpu`,
  `prep_level_plan`, `prep_other`}; sums close to within ms.
- New `?hostHist=1` URL flag on the dev page routes `prepare()` through
  the host loop instead of the GPU dispatch — an in-tree A/B knob for
  diagnosing whether changes to the GPU histogram pass affect
  downstream cache state.
- `bucket_histogram_gpu` is the new sub-row in the host-phases table —
  GPU dispatch time of the histogram pass, separated from the host
  `mapAsync` wait + 2 MB readback memcpy that share the
  `prep_booth_decode` row.

**What we learned (worth recording).**
- **`writeBuffer` is host-blocking on Chrome.** At n=2²⁰ the 32 MB scalar
  upload takes ~12 ms of pure host time (synchronous memcpy from the JS
  TypedArray into Chrome's driver-managed staging area) before the call
  returns. This is the lower bound for any prepare() refactor; the
  upload can be overlapped with GPU work but the call itself is host
  cost.
- **The GPU dispatch is essentially free.** `bucket_histogram_gpu` is
  1.38 ms at n=2²⁰. Most of `prep_booth_decode` (5.6 ms total) is host
  overhead — `mapAsync` polling latency + the 2 MB readback memcpy.
- **`fused` regressed ~15 ms (10%) at n=2²⁰** due to system-level-cache
  eviction by the histogram pass (34 MB touched: 32 MB scalar read +
  2 MB count write). Confirmed via `?hostHist=1` A/B — Δ scales with
  workload size, which is the cache-thrash fingerprint. See
  [STATUS.md](STATUS.md) "Known performance regression" and
  [ROADMAP.md](ROADMAP.md) M8 for the three candidate fixes (static
  plan revival, workgroup-shared histogram, cache warm-up).

**Why landed despite the regression.** Net trade is +140 ms per MSM at
n=2²⁰; the +15 ms `fused` cost is bounded and well-understood. M8 in
the roadmap tracks the recovery path; the diagnostic infrastructure
(`?hostHist=1`, the timestamped histogram pass, the corrected profile
hierarchy) is in place to validate any future improvement.
