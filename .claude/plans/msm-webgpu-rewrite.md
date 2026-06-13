# Plan: WebGPU BN254 MSM rewrite — BY field inversion + multi-window Pippenger + 32-bit point schedule

> Produced by Plan subagent on 2026-05-16. The execution loop owner (orchestrator
> Claude) iterates phases below via coder + reviewer subagents. Source of truth
> for what "done" means: this plan's acceptance gates.

## 0. Plan summary

**Two ideas to implement.**

**Idea 1 — Replace WGSL `fr_inv` with the Bernstein–Yang (BY) safegcd inversion that the WASM uses.**
Port `Wasm9x29::divsteps` + `Wasm9x29::apply_matrix` to WGSL (9 × 29-bit signed limbs, BATCH=58 inner divsteps per outer iter, NUM_OUTER=13 outer iters with early `g == 0` break, REDUCE_INTERVAL=4). Each outer iter folds 58 divsteps into one 2×2 matrix and applies it via a streamed schoolbook with limb-by-limb carry. Target: at least 2× wall reduction on the `fr_inv` critical path vs the existing jumpy safegcd `fr_inv`; ideally 3–5×.

**Idea 2 — Multi-window batched Pippenger + 32-bit point schedule.**
- Replace the per-round bucket-cursor + atomic pair counter design with a bucket-sorted 32-bit schedule built via histogram → per-window prefix-sum → scatter (Stages 1/2/3/4 of the WASM).
- Make the batch-affine reduce phase consume `NUM_WINDOWS_PER_BATCH × num_columns` pairs in one batched inversion so the inversion amortises over both buckets AND windows.
- Extend `batch_inverse_parallel`'s workgroup-Z dimension to `num_subtasks × NUM_WINDOWS_PER_BATCH`.
- Schedule entry layout matches the WASM's `Constantine` packed digit: bit 31 = sign, bits 0..28 = scalar_idx (29-bit payload). Dedup-redirect / dedup-skip bits exist in the encoding but are unused.

**Out of scope (explicit per spec):** duplicate stripping, two bucket widths for one MSM, adaptive c.

---

## 1. Required reading

The first coding agent MUST read these before writing any code.

**WASM reference (source of ideas):**
1. `/Users/zac/barretenberg-claude-2/barretenberg/cpp/src/barretenberg/ecc/fields/bernstein_yang_inverse.hpp`
2. `/Users/zac/barretenberg-claude-2/barretenberg/cpp/src/barretenberg/ecc/fields/bernstein_yang_inverse_wasm.hpp` — `Wasm9x29` (closest to WGSL target)
3. `/Users/zac/barretenberg-claude-2/barretenberg/cpp/src/barretenberg/ecc/scalar_multiplication/scalar_multiplication.cpp`:
   - lines 1–350 (file header, `get_scalar_slice_low`, `compute_constantine_slice_params`, `get_constantine_packed_digit`)
   - lines 540–710 (schedule entry bit constants, `VariableWindowSchedule`, `RegionView`, cost model)
   - lines 1620–1800 (`pippenger_round_parallel_jacobian_fast` — single-thread textbook structural reference)
   - lines 2671–2830 (entry to `pippenger_round_parallel`, Arena setup, Phase 1)
   - lines 3780–4080 (Stage 1 histogram, Stage 2/3 bucket-offset, Stage 4 scatter; skip Phase A dedup body)
   - lines 4210–4550 (Stage 6 partition, Stage 6a/6b bucket reduction across `windows_in_batch`)
   - lines 4550–4610 (per-region dispatch driver, lower/upper regions, batch loop)

**Existing WebGPU MSM (target codebase):**
4. `barretenberg/ts/src/msm_webgpu/wgsl/field/fr_pow.template.wgsl`
5. `barretenberg/ts/src/msm_webgpu/wgsl/bigint/bigint.template.wgsl`
6. `barretenberg/ts/src/msm_webgpu/wgsl/cuzk/batch_inverse_parallel.template.wgsl`
7. `barretenberg/ts/src/msm_webgpu/wgsl/cuzk/batch_inverse.template.wgsl`
8. `barretenberg/ts/src/msm_webgpu/cuzk/shader_manager.ts`
9. `barretenberg/ts/src/msm_webgpu/cuzk/batch_affine.ts`
10. `barretenberg/ts/src/msm_webgpu/msm.ts` lines 540–924
11. `barretenberg/ts/src/msm_webgpu/wgsl/cuzk/batch_affine_schedule.template.wgsl`
12. `barretenberg/ts/src/msm_webgpu/wgsl/cuzk/batch_affine_apply_scatter.template.wgsl`
13. `barretenberg/ts/src/msm_webgpu/wgsl/cuzk/batch_affine_init.template.wgsl`, `batch_affine_dispatch_args.template.wgsl`, `batch_affine_finalize_collect.template.wgsl`, `batch_affine_finalize_apply.template.wgsl`
14. `barretenberg/ts/src/msm_webgpu/cuzk/bn254.ts` (host BigInt reference)
15. `barretenberg/ts/dev/msm-webgpu/bench-field-mul.ts`, `bench-field-mul.html`
16. `barretenberg/ts/dev/msm-webgpu/scripts/bench-field-mul.mjs`
17. `barretenberg/ts/dev/msm-webgpu/main.ts` lines 1180–1300 (`Quick sanity check (WebGPU only)` button)

**Hard constraints for every coding agent (repeated in every task brief):**

- WebGPU on Apple Silicon Metal is FRAGILE. A wedged shader can require a reboot.
- **Every WGSL loop MUST have a compile-time-constant upper bound** (`for (var i = 0u; i < CONST; i = i + 1u)` where `CONST` is a `const` or substituted Mustache value). Reject any shader that fails this audit.
- For the BY divsteps inner loop: bound is `BATCH = 58` as a `const`. Outer loop bound is `NUM_OUTER = 13`, also a `const`.
- For BY `apply_matrix` streamed schoolbook: bound is `const N: u32 = NUM_LIMBS_BY` — must be a `const`, not a runtime expression.
- Test order: `bench-field-mul` micro-bench first (n=2^10 to 2^14), then **only after green**, the dev-page Sanity Check at logN=16. Never invoke any MSM-runtime harness from Node.
- The base-field multiplication (`montgomery_product` Karat+Yuval) just landed; **do not modify it**.
- Never delete the existing `fr_inv` / `fr_inv_plain` / `fr_inv_bgcd`. They stay as A/B fallbacks.

---

## 2. Phase 1 — BY field inversion in WGSL

### 2.1 Locate the algorithm

- Driver: `bernstein_yang_inverse.hpp` lines 290–326 (`invert_bernsteinyang19<S>`).
- 9×29-bit engine: `bernstein_yang_inverse_wasm.hpp` lines 1–258.
  - `Wasm9x29::divsteps(delta, f_lo, g_lo)` — lines 147–178.
  - `Wasm9x29::apply_matrix(m, f, g, d, e, p, p_inv)` — lines 187–255.
  - `Wasm9x29::reduce_to_canonical(p)` — lines 125–145.
- Convergence bound: 735 divsteps cited at header lines 26–27. With BATCH=58 → ⌈735/58⌉ = 13 outer iters.

### 2.2 Iteration count and determinism

- `NUM_OUTER = 13` hard cap, with early exit on `g == 0`.
- `BATCH = 58` inner divsteps per outer iter.
- Variable-time over branches; BN254 base-field values in our pipeline are public, so OK.
- Fully deterministic for a given input.

### 2.3 WGSL representation

Decisive choice: **Option B — `BigIntBY = array<i32, 9>` of 29-bit signed limbs.** This matches the WASM and reaches the perf target.

Conversion on entry/exit between the 20×13-bit `BigInt` and `BigIntBY`. The conversion is ~20 ops each way; per-call cost amortises over NUM_OUTER × BATCH ≈ 750 inner ops + 13 matrix applications.

### 2.4 New WGSL files / signatures

Create (Mustache partial `{{> by_inverse_funcs }}`):

**File: `barretenberg/ts/src/msm_webgpu/wgsl/field/by_inverse.template.wgsl`**

Top-level entry (drop-in replacement for existing `fr_inv`):

```wgsl
// Bernstein-Yang safegcd inverse on 9 × 29-bit signed limbs.
// Input in Montgomery form. Output mont(a^(-1)).
fn fr_inv_by(a: BigInt) -> BigInt
```

Required constants and helpers (loop bounds all `const`):

```wgsl
const BY_NUM_LIMBS: u32 = 9u;
const BY_LIMB_BITS: u32 = 29u;
const BY_LIMB_MASK: u32 = (1u << 29u) - 1u;
const BY_BATCH: u32 = 58u;
const BY_NUM_OUTER: u32 = 13u;
const BY_REDUCE_INTERVAL: u32 = 4u;
const BY_RTC_MAX_ITERS: u32 = 36u;        // matches Wasm9x29::reduce_to_canonical

struct BigIntBY { l: array<i32, 9> };

fn by_from_bigint(x: BigInt) -> BigIntBY;
fn by_to_bigint(x: BigIntBY) -> BigInt;
fn by_get_p() -> BigIntBY;
fn by_one() -> BigIntBY;
fn by_low_u64_lohi(x: BigIntBY) -> vec2<u32>;
fn by_is_zero(x: BigIntBY) -> bool;
fn by_is_negative(x: BigIntBY) -> bool;
fn by_neg(x: BigIntBY) -> BigIntBY;
fn by_normalise(x: ptr<function, BigIntBY>);
fn by_reduce_to_canonical(x: ptr<function, BigIntBY>, p: ptr<function, BigIntBY>);

// Matrix entries split into (lo: i32, hi: i32) representing i64 values.
// After BATCH=58 divsteps, |entry| ≤ 2^58.
struct Mat { u: i32, v: i32, q: i32, r: i32, u_hi: i32, v_hi: i32, q_hi: i32, r_hi: i32 };

fn by_divsteps(delta: ptr<function, i32>, f_lo: vec2<u32>, g_lo: vec2<u32>) -> Mat;
fn by_apply_matrix_fg(m: Mat, f: ptr<function, BigIntBY>, g: ptr<function, BigIntBY>);
fn by_apply_matrix_de(m: Mat, d: ptr<function, BigIntBY>, e: ptr<function, BigIntBY>,
                       p: ptr<function, BigIntBY>, p_inv_lo: u32, p_inv_hi: u32);

fn fr_inv_by(a: BigInt) -> BigInt;
```

`by_divsteps`: transliterate `Wasm9x29::divsteps` lines 147–178. Use `vec2<u32>` for the 64-bit `f_lo` and `g_lo` carriers (WGSL has no native i64). Carry the matrix entries `u, v, q, r` as paired `(lo: i32, hi: i32)` because they grow up to 2^58. Loop bound: `for (var i: u32 = 0u; i < BY_BATCH; i = i + 1u) { ... }`.

`by_apply_matrix_fg` / `by_apply_matrix_de`: transliterate lines 196–254. Each per-limb `m_lo * limb` is an i58, NOT i32. Define a single safe `signed_mul_split(a: i32, b: i32) -> vec2<i32>` helper bounded to |a|, |b| ≤ 2^29 and reuse everywhere. The coding agent picks the exact partial-product splits; the contract is only that each partial fits in i32.

### 2.5 Test harness — `fr_inv` micro-bench

Add `barretenberg/ts/src/msm_webgpu/wgsl/cuzk/fr_inv_bench.template.wgsl` (mirrors `field_mul_bench_u32.template.wgsl`). Per-thread chained `fr_inv_<variant>` `k` times, write to outputs.

Host-side: `gen_fr_inv_bench_shader(workgroup_size, variant)` in `shader_manager.ts`, `--variant fr_inv_by` whitelisted in `bench-field-mul.mjs` and `bench-field-mul.ts`. Reference: `modInverse` from `cuzk/bn254.ts` with Mont conversion.

**Acceptance criteria for Phase 1:**
1. `bench-field-mul.mjs --path u32 --variant fr_inv_by --n 1024 --k 1 --validate-n 1024` → all 1024 match host reference.
2. `--n 65536 --k 10` runs to completion (no hang, no `[shader fr_inv_bench] error:` console message).
3. `fr_inv_by` ≥ 2× faster than `fr_inv` median wall (target 3–5×).

### 2.6 Wiring into production

After Phase 1 acceptance:
1. `wgsl/cuzk/batch_inverse_parallel.template.wgsl` line ~219: `fr_inv` → `fr_inv_by`.
2. `wgsl/cuzk/batch_inverse.template.wgsl` line ~77: `fr_inv` → `fr_inv_by`.
3. `shader_manager.ts`: include `{{> by_inverse_funcs }}` in `gen_batch_inverse_parallel_shader` / `gen_batch_inverse_shader` partials.
4. Run Quick Sanity Check at logN=16 via Playwright; expect `[sanity] PASS`. If FAIL, revert and bisect via the micro-bench.

---

## 3. Phase 2 — Multi-window batched Pippenger + 32-bit point schedule

### 3.1 WASM multi-round structure

(All line refs in `scalar_multiplication.cpp`.)

**Outer dispatch (4551–4604):** Lower region + optional Upper region. We use only the lower region (single c).

**Per region (4570–4602):** iterate windows in batches of `windows_per_batch`. Within one batch:
- **Stage 1 (3785–3877):** per-thread per-window digit histogram. Output `digit_cursors[(w · T + t) · bucket_stride + d]`.
- **Stage 2 (3879–3909):** per-thread → per-window prefix-sum. Writes per-(window, thread, digit) cursor base; writes per-digit totals to `bucket_start[d+1]`.
- **Stage 3 (3911–3937):** per-window serial prefix-sum on `bucket_start`.
- **Stage 4 (3939–4075):** scatter. Re-decodes each scalar's window-w digit, writes the 32-bit schedule entry to `schedule[w * capacity + bucket_start[d] + cursor[d]++]`. Dedup OFF.
- **Stage 5 (4211–4217):** per-window chunk partition.
- **Stage 6a (4344–4399):** per-(thread, window) batched-affine bucket reduction → `bucket_partials_dense`.
- **Stage 6b (4401–4525):** cross-thread, per-task slice `[d_lo, d_hi]`, `recursive_affine_bucket_reduce_strided` — the multi-window batched inversion.
- **Stage 7 (4534–4548):** per-window combine of per-thread partials.

Final Horner combine over all windows: lines 4606–4615.

### 3.2 32-bit schedule entry encoding

Adopt bit-for-bit from WASM (lines 552–567):
- bit 31: sign
- bit 30: dedup redirect (always zero)
- bit 29: dedup skip (always zero)
- bits 0..28: scalar_idx (≤ 2^29 = 512M, plenty for logN ≤ 28)

### 3.3 WGSL changes

**Replace:**
- `wgsl/cuzk/batch_affine_schedule.template.wgsl` — delete the per-round bucket-cursor / atomic pair counter. Replace with three new shaders:

**New `wgsl/cuzk/schedule_histogram.template.wgsl`** (Stage 1)
```wgsl
// Per-thread per-window per-digit histogram.
// Dispatch: (ceil(n / wg_size), 1, num_subtasks_in_batch)
// const NUM_WINDOWS_IN_BATCH: u32 = {{ num_windows_in_batch }}u;
// const NUM_BUCKETS: u32 = {{ num_columns }}u;
// Writes digit_cursors[(w * num_threads + tid) * num_buckets + d].
```

**New `wgsl/cuzk/schedule_offsets.template.wgsl`** (Stage 2 + 3)
```wgsl
// One workgroup per (window, bucket-slice). Per-window prefix-sum.
// Output: bucket_start[w][d+1], digit_cursors[w][t][d].
```

**New `wgsl/cuzk/schedule_scatter.template.wgsl`** (Stage 4)
```wgsl
// Dispatch: (ceil(n / wg_size), 1, num_subtasks_in_batch)
// sched[w * capacity + bucket_start[w][d] + cursor++] = sign << 31 | scalar_idx
```

**Keep + extend:**
- `batch_affine_apply_scatter.template.wgsl`: bind layout reads from bucket-sorted schedule; affine-add math unchanged.
- `batch_inverse_parallel.template.wgsl`: Z dimension becomes `num_subtasks × NUM_WINDOWS_IN_BATCH`. Inside, decode `wid.z` into `(subtask_in_batch, window_in_batch)`.
- `batch_affine_finalize_collect.template.wgsl` / `_apply.template.wgsl`: unchanged (called once at end of MSM).

**New `wgsl/cuzk/bucket_reduce.template.wgsl`** (Stage 6a per-window single-thread bucket accumulator). Per-window kernel that:
1. Reads `schedule[w][chunk_start..chunk_end]` (bucket-sorted).
2. Accumulates each run of contiguous same-bucket entries via the existing batched-affine tree reduce (reuses `batch_inverse_parallel`).
3. Output per-(thread, window) `bucket_partials_dense`.

### 3.4 Host TS changes

`cuzk/batch_affine.ts` — major rewrite of `smvp_batch_affine_gpu`:
1. Add `windows_per_batch: number` (start = 4).
2. Replace init + schedule + (per-round inverse+apply) with: dispatch histogram → offsets → scatter → outer loop over batches → per-batch round loop with Z dispatch `windows_per_batch × num_subtasks_in_batch`.
3. Buffer changes: drop `pair_counter` (replaced by per-(w, subtask) atomic). Drop `bucket_cursor` (replaced by `digit_cursors`). Add `bucket_start`. Add `schedule` (32-bit bucket-sorted, ~`num_subtasks × num_columns × 4` bytes ≈ 2 MB at logN=16).

`cuzk/shader_manager.ts` — add:
- `gen_schedule_histogram_shader(workgroup_size, num_columns, num_windows_in_batch)`
- `gen_schedule_offsets_shader(workgroup_size, num_columns, num_windows_in_batch)`
- `gen_schedule_scatter_shader(workgroup_size, num_columns, num_windows_in_batch)`

Bump cache keys with new tag `mwb-v1`.

`msm.ts` — at the `smvp_batch_affine_gpu` call, add `windows_per_batch: 4`.

`cuzk/batch_affine_bn254.ts` (host reference) — extend `batchAffineMSM` with `windowsPerBatch`; one batched inversion spans pairs from all windows in the batch. **Required as ground truth for correctness tests.**

### 3.5 Constants exported WASM → WGSL

| Constant | Value | WGSL exposure |
|---|---|---|
| `SCHEDULE_SIGN_BIT` (line 559) | `1 << 31` | `const SCHED_SIGN_BIT: u32 = 1u << 31u;` |
| `DEDUP_REDIRECT_BIT` (560) | `1 << 30` | `const SCHED_REDIRECT_BIT: u32 = 1u << 30u;` (always zero) |
| `DEDUP_SKIP_BIT` (561) | `1 << 29` | `const SCHED_SKIP_BIT: u32 = 1u << 29u;` (always zero) |
| `SCHEDULE_INDEX_MASK` (562) | `(1<<29) - 1` | `const SCHED_INDEX_MASK: u32 = (1u << 29u) - 1u;` |
| `BATCH_CAPACITY` (596) | 256 | `const BATCH_AFFINE_BREAKEVEN: u32 = 256u;` |
| `BATCH_AFFINE_BREAKEVEN` (1525) | 32 | `const BATCH_AFFINE_DRAIN_THRESHOLD: u32 = 32u;` |

`chunk_size` (c) stays at 15/16 per `msm.ts:554`. `num_columns = 2^c`.

### 3.6 Intermediate validation milestones (each is a hard gate)

For each milestone, the test is the Quick Sanity Check button at logN=16 via Playwright (`[sanity] PASS in N ms`):

- After `shader_manager` additions, before host orchestrator changes: WGSL compile-only check via `getCompilationInfo()`.
- After histogram + offsets + scatter, `windows_per_batch = 1`: read back schedule on n=2^10 / 2^12; per-(w, d, k) entry matches host's bucket-sorted ground truth (set equality).
- After `bucket_reduce`, `windows_per_batch = 1`: Sanity Check PASS at logN=16.
- After `NUM_WINDOWS_PER_BATCH = 2`: Sanity Check PASS at logN=16.
- After `NUM_WINDOWS_PER_BATCH = 4`: Sanity Check PASS at logN=16 + visible `ba_inverse + ba_apply` wall reduction in `Profiler.report()`.

### 3.7 Workgroup sizing

- `schedule_histogram`: WG=256, dispatch `(ceil(n/256), 1, num_subtasks_in_batch)`. Per-thread arrays (no shared workgroup atomics).
- `schedule_offsets`: WG=64, dispatch `(1, 1, num_windows_in_batch)`. Per-thread → cross-thread → per-digit prefix sums.
- `schedule_scatter`: WG=256, same dispatch shape as histogram.
- `bucket_reduce`: WG=64 (matches existing apply_scatter). Z = `num_subtasks × NUM_WINDOWS_PER_BATCH`.
- `batch_inverse_parallel`: WG=64. Z = `num_subtasks × NUM_WINDOWS_PER_BATCH`.

### 3.8 Loop-bound audit

All loops introduced in Phase 2 use a `const`-bounded counter:
- `schedule_histogram` inner: `for (var w = 0u; w < NUM_WINDOWS_IN_BATCH; ...)`.
- `schedule_offsets` reductions: `for (var t = 0u; t < TPB; ...)`.
- Hillis-Steele scan: `for (var stride: u32 = 1u; stride < TPB; stride = stride * 2u)`.
- `schedule_scatter` window loop: `NUM_WINDOWS_IN_BATCH`.
- `bucket_reduce` tree-reduce pass: bounded by `BATCH_AFFINE_BREAKEVEN`.

Audit step after every render: `grep -E 'for *\(.*<' rendered.wgsl | grep -v -E '< [A-Z][A-Z_]*[a-z]?|< [0-9]+|< [a-z_]+\.x' | grep -v 'workgroup_size'`.

---

## 4. Test plan

| Phase | Test | Harness | Pass |
|---|---|---|---|
| 1.A | BY divsteps TS unit test | new Jest `cuzk/bernstein_yang.test.ts`, ~1000 random inputs vs `modInverse` | all match |
| 1.B | WGSL `fr_inv_by` correctness | `bench-field-mul.mjs --variant fr_inv_by --n 1024 --validate-n 1024 --k 1` | all 1024 match |
| 1.C | WGSL `fr_inv_by` perf | same w/ `--n 65536 --k 10 --reps 5` | ≥ 2× faster median than `fr_inv` |
| 1.D | E2E Sanity w/ BY swap-in | Playwright Quick Sanity Check button | `[sanity] PASS` |
| 2.A | Schedule correctness | `wgsl_unit_tests.ts` helper, n=2^10 | set equality vs host ground truth |
| 2.B | Bucket reduction `windows_per_batch=1` | Quick Sanity Check at logN=16 | PASS |
| 2.C | `NUM_WINDOWS_PER_BATCH=2` | Quick Sanity Check at logN=16 | PASS |
| 2.D | `NUM_WINDOWS_PER_BATCH=4` | Quick Sanity Check at logN=16, 18 | PASS + ≥ 1.5× wall reduction |

**Critical safety rule:** Full MSM correctness ONLY via the Quick Sanity Check button via Playwright. NEVER invoke `compute_bn254_msm_*` directly from Node — the dev-page-button-with-Playwright is the only path validated against Apple Silicon Metal. Micro-bench (`bench-field-mul`) is for primitives only.

---

## 5. Iteration breakdown (17 sub-steps, ≥ 10 floor met)

**Phase 1:**

1. **1.1** — Transliterate `Wasm9x29::divsteps` + `apply_matrix` + `reduce_to_canonical` + driver to TS. Jest `bernstein_yang.test.ts` with 1000 random inputs vs `modInverse`. Gate: all match.
2. **1.2** — Add WGSL bigint helpers: `signed_mul_split`, vec2<u32> 64-bit add/sub/shift, `by_normalise` carry propagation. New `wgsl/bigint/bigint_by.template.wgsl`. Unit-test via scratch shader.
3. **1.3** — Write WGSL `by_divsteps`. Validate via `divsteps_bench` shader vs TS port.
4. **1.4** — Write WGSL `by_apply_matrix_fg` / `by_apply_matrix_de`. Precompute `p_inv_by_lo` / `p_inv_by_hi` via Mustache in `shader_manager.ts`.
5. **1.5** — Wire `fr_inv_by` + `by_reduce_to_canonical`. Add `gen_fr_inv_bench_shader` + `--variant fr_inv_by`. `--n 1024 --validate-n 1024 --k 1` → all match. Hard gate.
6. **1.6** — Perf pass. `--n 65536 --k 10 --reps 5`. Hard gate: ≥ 2× over `fr_inv`.
7. **1.7** — Swap `fr_inv` → `fr_inv_by` in `batch_inverse_parallel` and `batch_inverse`. Quick Sanity Check at logN=16. Hard gate: PASS.

**Phase 2:**

8. **2.1** — Host BigInt reference for multi-window batched Pippenger. Extend `cuzk/batch_affine_bn254.ts` with `windowsPerBatch`. Jest cross-check vs `windowsPerBatch=1`.
9. **2.2** — Stage 1 `schedule_histogram`. Add unit test in `wgsl_unit_tests.ts` dispatching on n=2^10, compare per-(w, t, d) vs host.
10. **2.3** — Stage 2/3 `schedule_offsets`. Validate `bucket_start` after kernel = exclusive prefix of `Σ_t digit_cursors`.
11. **2.4** — Stage 4 `schedule_scatter`. Validate via read-back test 2.A. Gate: set equality.
12. **2.5** — `bucket_reduce` for one window (`NUM_WINDOWS_PER_BATCH=1`). Reuse `batch_affine_apply_scatter` math; rewire input from bucket-sorted schedule.
13. **2.6** — Rewire `batch_affine.ts` to dispatch histogram → offsets → scatter → bucket_reduce → finalize at `windows_per_batch=1`. Gate: Sanity Check PASS at logN=16, 14, 12.
14. **2.7** — Bump `NUM_WINDOWS_PER_BATCH` to 2. Decode `wid.z` into (subtask_in_batch, window_in_batch). Gate: Sanity Check PASS at logN=16.
15. **2.8** — Bump to 4 + profile. Gates: Sanity Check PASS at logN=16, 18; ≥ 1.5× wall reduction on `ba_inverse + ba_apply` summed across batches.
16. **2.9** — Cleanup + cache-key bump to `mwb-v1`. Re-run all sanity gates.
17. **2.10** — Final integration. Sanity Check at logN=14, 15, 16, 17, 18, 19, 20. Each must PASS. Wall time vs pre-rewrite baseline.

---

## 6. Out of scope (per user)

- Duplicate stripping (Phase A / dedup). Bits 29 and 30 of the schedule stay zero.
- Two bucket widths for one MSM (variable-window split).
- Adaptive c.

If a coding agent finds themselves implementing any of these three, STOP.

---

## Critical files for implementation

- `/Users/zac/aztec-packages/barretenberg/ts/src/msm_webgpu/wgsl/field/fr_pow.template.wgsl`
- `/Users/zac/aztec-packages/barretenberg/ts/src/msm_webgpu/wgsl/bigint/bigint.template.wgsl`
- `/Users/zac/aztec-packages/barretenberg/ts/src/msm_webgpu/wgsl/cuzk/batch_inverse_parallel.template.wgsl`
- `/Users/zac/aztec-packages/barretenberg/ts/src/msm_webgpu/cuzk/batch_affine.ts`
- `/Users/zac/aztec-packages/barretenberg/ts/src/msm_webgpu/cuzk/shader_manager.ts`

Reference-only — source of all the algorithm structure:
- `/Users/zac/barretenberg-claude-2/barretenberg/cpp/src/barretenberg/ecc/fields/bernstein_yang_inverse_wasm.hpp`
- `/Users/zac/barretenberg-claude-2/barretenberg/cpp/src/barretenberg/ecc/scalar_multiplication/scalar_multiplication.cpp` lines 540–710, 1620–1800, 2671–2830, 3780–4080, 4210–4610.
