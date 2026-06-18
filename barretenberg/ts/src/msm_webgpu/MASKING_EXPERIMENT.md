# Additive scalar masking — run every MSM on the GPU

## The idea

The WebGPU MSM computes wrong commitments for **structured** scalars — small
(~14-bit), sparse (many zeros), heavily repeated — which is the shape of the
translator range-constraint polynomials (and `Z_PERM@131071`). Those columns are
currently kept off the GPU by a blocklist.

Masking removes the structure instead of avoiding it. Pick a per-row random
vector `R` over the SRS positions, reused across every column, and compute the
MSM on `(s + R) mod r` instead of `s`:

```
C' = Σ ((sᵢ + Rᵢ) mod r) · Pᵢ  =  Σ sᵢPᵢ  +  Σ RᵢPᵢ  =  C + O
```

`(sᵢ + Rᵢ) mod r` is uniform over the field regardless of `sᵢ`, so the GPU only
ever sees full-width random scalars — its known-good case. The true commitment
is recovered by subtracting the **offset** `O = Σ RᵢPᵢ`, which depends only on
`(srsOffset, n)` and is precomputed once and reused across all columns, rounds,
and proves.

A single constant `r` would NOT work (zero scalars all collapse to the same
window digit → heavy buckets again). The per-row `Rᵢ` is what makes every masked
scalar independently uniform.

## Why the overhead is small

`MsmV2` already runs every MSM at full 254-bit width
(`windowsPerMsm = ceil(254/c)`, independent of scalar magnitude), so masking
adds **no window-count work**. The only added costs are:

| cost | when | size |
|---|---|---|
| mask pre-pass (`mask_scalars` shader) | every MSM | one memory-bound O(n) dispatch (~n·12 B traffic; sub-ms at n=2^17) |
| offset `O = Σ RᵢPᵢ` | first time each `(srsOffset, n)` is seen | one MSM, **cached** — lands in the discarded warm-up prove, not the measured rounds |
| offset subtraction `L₀ -= O` | every MSM | one host point op |

## What's implemented

- **`wgsl/cuzk/mask_scalars.template.wgsl`** — the pre-pass: `(s + R[srsOffset+p]) mod r`
  per scalar, 8×u32 limbs, BN254 `r` hardcoded, unrolled (Adreno-safe). Rebuild
  the bundle with `node src/msm_webgpu/scripts/inline-wgsl.mjs` after editing.
- **`MsmV2`** (`msm_v2.ts`) — `MsmConfig.maskBuf`. When set, `prepare()` runs the
  pre-pass on `scalarsRawBuf` **before** the histogram, so histogram + level plan
  + decompose all see the masked scalars. Reduces mod `r`, so a masked MSM is
  bit-identical in geometry to a normal full-width one. (Incompatible with
  `useHostHistogram`, which reads the un-masked host bytes — guarded.)
- **bridge `WebGpuMsmHost`** (`bridge/main.ts`) — armed by
  `globalThis.__bridge_mask_msms === true` at `OP_PUBLISH_SRS`. Generates `R`
  over the SRS, uploads `maskBuf`, passes it to every `MsmV2.create`, caches
  `O(srsOffset, n)` (noble), and subtracts `O` from window-0 in all three write
  paths (solo / mixed-N batch / same-N batch). Disables the Tier-2 `BatchMsmV2`
  route while masking (that path's instances have no `maskBuf`); same-N batches
  fall through to per-MSM `MsmV2` instances, which mask.
- **`serve.ts`** — `webgpuBlocklist()` drops the size/structure/perf blocks
  while masking is armed (so the translator/`Z_PERM`/wash MSMs all go to the
  GPU), leaving only the residual `PAIR_TREE_HOSTILE_LABELS`
  (`LOOKUP_READ_COUNTS`, `LOOKUP_READ_TAGS`, `VK_PRECOMPUTED_POLY`) on the CPU —
  see the finding below.

## Finding: not every blocked MSM is structured-scalar

The first masked e2e run (CPU cross-check armed) verified the design and exposed
its boundary: `VK_PRECOMPUTED_POLY @ n=17455, srsOff=1982` still **mismatched**
the cross-check *with masking on* (its scalars are ~92 % dense, nnz=16057). So
that MSM is wrong for a reason masking doesn't touch — not scalar structure
(large `srsOffset`, representation, or an unrelated MSM bug). The three
"block all sizes" labels (`LOOKUP_READ_COUNTS`, `LOOKUP_READ_TAGS`,
`VK_PRECOMPUTED_POLY`) are this class and stay on the CPU under masking. Masking
fixes the structured-scalar class (the translator `@131071` group); these three
are a separate, still-open issue.

## What's validated (no GPU) vs what needs a GPU

**Validated on CPU** (runs in CI, `src/msm_webgpu/mask_scalars.test.ts`):
- The shader's hardcoded `r` limbs reconstruct `Fr.ORDER` (catches a limb typo).
- The shader's 8×u32 `(s+R) mod r` limb arithmetic matches BigInt for edge cases
  (sum == r, sum == 2r-2), every structured shape, and bulk random.
- The algebra `C' - O == C` for all structured shapes, including one shared `O`
  across columns; masked scalars are zero-free, distinct, ~254-bit.

**Needs a real GPU** (cannot run headless — no WebGPU here):
- That masking actually makes the GPU compute the structured MSM correctly.
- The e2e prove runtime with all MSMs on the GPU.

## Runbook (on a hardware-GPU machine)

**1. Confirm masking fixes the bug, in isolation** — dev MSM page
(`barretenberg/ts/dev/msm-webgpu`), browser console after the SRS loads:

```js
await testRawMsm(131071, 1, false, 'sparse')   // control — expect MISMATCH ✗
await testRawMsmMasked(131071, 1, 'sparse')     // masked   — expect MATCH ✓
// also: 'small', 'binary', 'repeated'
```

`testRawMsmMasked` prints two lines: the offset `O` from a GPU zero-scalar run
cross-checked against noble, then `C'-O` vs the noble truth of the *original*
scalars. Both MATCH ⇒ the shader + MsmV2 masking + offset subtraction are correct
on this GPU.

**2. e2e prove with every MSM on the GPU** — chonk page
(`yarn-project/ivc-integration`). Click the **Masking: off → ON** toggle button
(next to Run WebGPU) to arm it; this sets `__bridge_mask_msms`, empties the
blocklist, and disposes the warm backend so the next run re-inits with masking.
(Equivalent console form: `window.__bridge_mask_msms = true` before warm-up.)
Optionally also `window.__bridge_verify_msms = true` for a per-MSM CPU
cross-check of the FINAL commitment.

Then click **Warm up**, then **Run WebGPU** (or **Run all (WebGPU)**). With
masking armed the blocklist is empty, so every MSM runs on the GPU. Confirm it
armed by the bridge's `[mask] enabled — R over <n> SRS positions …` log line on
the run. The first (warm-up) prove pays the one-time noble offset precompute
(`[mask] offset O(...)` lines); the measured rounds are clean. The in-browser
verify must pass.

To compare against today's blocklisted baseline, run once with the flag unset.

## Expected runtime (estimate — measure to confirm)

Masking's added per-MSM cost is sub-millisecond (a memory-bound pre-pass) plus a
host point subtraction; the offset MSMs are one-time and cached out of the
measured window. So the e2e delta vs the current blocklisted WebGPU run is
dominated by the **CPU→GPU swing of the ~15-20 % of MSM work currently blocked**
(the translator masking-shaped commits + same-N triplets). Those were blocked
partly because they were *wrong* and partly because several are a wash on Metal
(`cpu_solo/gpu ≤ 1.5×`), so moving them onto the GPU should land e2e within a few
percent of today — its real value is **correctness**: all MSMs can run on the GPU
and the proof still verifies. The upside is re-enabling the Tier-2 `BatchMsmV2`
route for the now-correct translator B=10 commit (measured 1.78–4.13× over solo),
which masking currently disables.

## Limitations / follow-ups

- **Off-SRS one-off MSMs are not masked** (their one-off pool has no `R`). Chonk
  MSMs are SRS-prefix, so this is not exercised; an off-SRS structured MSM would
  still need handling.
- **Tier-2 `BatchMsmV2` is disabled under masking.** To get the batch speedup on
  the now-correct translator commit, thread `maskBuf` (and the window-0 offset)
  through `BatchMsmV2` and re-enable the route.
- **Offsets use noble** (seconds at n=2^17, one-time/cached). For a faster
  warm-up, compute `O` via a GPU zero-scalar masked run (`masked = R`), which
  `testRawMsmMasked` already validates against noble.
- The existing dev probes (`testRawMsm`/`Reuse`/`SameN`) call `log('error', …)`;
  the typed level is `'err'`. Pre-existing typos (latent — `log` falls back to no
  CSS class), trivially fixable, not touched here.
