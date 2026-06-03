# Split-c (variable-window) MSM — GPU plan

Variable-window Pippenger for the WebGPU MSM. The win is on **skewed/structured
scalar distributions** (profiles D/E, and any real ECCVM/Chonk input where most
scalars are small): instead of a uniform `c` across ~20 windows, use **two
regions** so the sparse high bits cost almost nothing.

- **Lower** bits `[0, b_star)`: `W_lo` windows of width `c_lo`, iterated by **all
  `n`** scalars.
- **Upper** bits `[b_star, 254)`: `W_hi` windows of width `c_hi < c_lo`, iterated
  **only by `idx_large`** = scalars whose MSB lands in the upper region
  (`msb ≥ b_star-1`; the boundary bit is included so the upper region cancels the
  negative-signed digit the lower region's last window emits).

**Reference CPU implementation** (port this, don't reinvent):
`~/barretenberg-claude-2/.../scalar_multiplication.cpp`, branch
`pippenger-refactor-full-11-may`:
- `choose_var_window_split` (`:721`) — MSB-histogram → grid-search `b_star` → cost
  model; takes the split only if predicted ≤ 85% of unsplit.
- `build_var_window_schedule` (`:831`) — fills per-window `window_bits`/`bit_base`/
  `num_buckets`. NO_SPLIT = uniform fill (one region).
- `predict_schedule_cost` (`:668`), `VariableWindowSchedule`/`RegionView` (`:633`).
- Total bits = `num_bits + 2` (the +2 is the carry-less top bit of the Constantine
  signed recoder, already matched by the GPU decompose).

## THE design rule: everything stays on the GPU, envelope-bounded, divide-free

This plan was audited against three failure modes. The rules below are the audit
conclusions — violate them and you reintroduce the exact problems they prevent.

### 1. No host work that the GPU should do
- **MSB histogram is a GPU kernel**, NOT a host pass. (`ARENA_LAYOUT.md` §5's
  "host-side from the zero-copy scalar view" is WRONG — corrected there.) Reading
  all `n` scalars back to the host to bin them is a 4 MB round-trip to save a 1 KB
  one. One `atomicAdd` per scalar into 256 bins (workgroup-reduced to cut
  contention), same pattern as `radixHist` / the transpose histograms.
- **The histogram kernel also writes `msb_per_scalar`** (n × u8 ≈ 128 KB @ logN17)
  so the `idx_large` compaction REUSES the MSB instead of a second O(n) scalar
  read. Compute each scalar's MSB exactly once.
- **The split decision is a GPU single-workgroup kernel.** Its input is the 256
  bins, not `n` — there is no reason to round-trip. It runs the
  `choose_var_window_split` grid (14 `b_star` candidates) + `build_var_window_schedule`
  and writes `WindowDesc[]` + the front-end indirect-dispatch args directly.
- **Buffer allocation is host-side** (only the host makes GPU buffers) — but it
  sizes to the **unsplit envelope**, known from `n`/`c` *without* the decision, so
  nothing waits on a schedule readback.

### 2. No redundant / dead dispatches
- **Region-split, correctly sized.** `decompose` and the transpose (count/reduce/
  scan/scatter) run as TWO dispatches: lower over `n × W_lo`, upper over
  `n_large × W_hi`. Never a single dispatch padded to `n` — split makes *more,
  narrower* windows (`W_lo+W_hi` up to `VAR_WINDOW_MAX_WINDOWS=128` vs ~20 unsplit,
  because `c_hi < c_lo`), so a padded upper dispatch would spawn `n − n_large` dead
  workgroups **per upper window**.
- **Indirect dispatch for the variable counts.** The host doesn't know
  `W_lo`/`W_hi`/`n_large` (GPU-decided). The decision kernel writes the dispatch
  args; the front-end indirect-dispatches (reuse the pair-tree's indirect-dispatch
  infra). No over-dispatch to the 128-window envelope.
- **Bucket kernels stay UNIFIED.** classify / radix / cumsum / partition /
  stream_walker / combine / size1 / pt_finalize / reduce iterate the active-bucket
  list, which is window-agnostic — they run in ONE dispatch over all buckets, using
  the bid→window decode below. Only decompose + transpose are region-split.

### 3. No runtime integer divide in the hot path  ←  the subtle one
Today `red_slot = (bid/BW)*STRIDE + (bid%BW - 1)` with **constant** `BW`, so the
compiler strength-reduces the divide. Under split-c `BW` varies per window, so a
naive "table-driven BW" turns that into a **runtime integer divide+mod per bucket**
— GPUs have no HW integer divide (~20-40 cycle software routine), on every bucket,
in the walker's hottest loop. It would tank the *whole* MSM, not just split-c.

**Fix — packed-window bid:** the planner emits `bid = (window << K) | mag` with
`K = 15` (≥ `c_max-1`; `pickC` caps `c ≤ 15` so `mag < 2^15`, and `window < 128 <
2^7`, total ≤ 22 bits). Then:
- `window = bid >> K`, `mag = bid & ((1<<K)-1)` — pure shifts, no divide.
- `red_slot = WindowDesc[window].reduce_off + (mag - 1)` — one cached table read.
- The radix sort already sorts by bid; packed bids sort as `(window, mag)` — the
  exact order the monotonic walker wants, and **identical relative order to the
  flat encoding** (`mag < BW < 2^K`), so the sort is byte-identical too.
This representation is used on the **uniform path first** (Phase 0), so it proves
out divide-free and byte-identical *before* any variable geometry exists.

## The `WindowDesc[]` table

One storage buffer, stride-8 u32 rows (5 fields used + 3 pad). As actually built
in `msm_v2.ts` (NOT the original sketch — `num_buckets` holds the reduce-slot count
STRIDE, and the CSR column count is a separate `num_columns` field). Per window `w`:

```wgsl
// WD_STRIDE = 8 u32 per row.
//  +0 window_bits : c_w
//  +1 bit_base    : Σ_{k<w} c_k          (start bit in the scalar)
//  +2 num_buckets : stride_w = 2^(c_w-1)  (red_buf slots per window; the magnitude
//                                          upper bound — classify drops mag>this)
//  +3 work_off    : Σ_{k<w} num_columns_k (CSR/PASS bucket-id base; prefix of +5)
//  +4 reduce_off  : Σ_{k<w} stride_k       (red_buf base; prefix of +2)
//  +5 num_columns : BW_w = pad(2^(c_w-1)+1) (transpose CSR column count per window)
```
`region` (lower/upper) and `point source` (identity vs `idx_large`) are derived
from `w < W_lo`. **`no-split = uniform fill`**: `window_bits=c`, `bit_base=w·c`,
`num_buckets=STRIDE`, `work_off=w·BW`, `reduce_off=w·STRIDE`, `num_columns=BW` →
every kernel reproduces today's output exactly. (`BW = pad(2^(c-1)+1)` to a
multiple of `PLANNER_TPB`; the table is padded to `numBatches·batchWindows` rows so
short final batches have valid padded-window entries.)

## Memory — envelope-bounded, no bloat

| Buffer | Size | Note |
|---|---|---|
| buckets (redBuf / scatter / CSR) | `Σ num_buckets`, `n·W_lo + n_large·W_hi` | both **≤ unsplit envelope** (`c_lo≈c_unsplit`, `W_lo<NW`, `n_large<n`) — arena §3 sizing unchanged |
| `WindowDesc` | ≤128 × 32 B = 4 KB | — |
| histogram | 256 × u32 = 1 KB | — |
| `msb_per_scalar` | n × u8 (128 KB @17) | avoids the `idx_large` recompute |
| `idx_large` | ≤ n × u32 | carve from an arena slot |

Size the arena to the **unsplit** envelope (`scalar_multiplication.cpp:2525` uses
the unsplit `num_buckets` as the conservative `B_eff` bound *before* the split);
the split only redistributes within it. Buffers sized by *window count* (WindowDesc,
dispatch-arg arrays) must allow 128 — all tiny. Keep the budget gate / `numBatches`
staging driven by the unsplit envelope (it's the upper bound, so split always fits).

## Front-end pipeline (all GPU-resident)

```
histogram(scalars) → {hist[256], msb_per_scalar[n]}      // 1 dispatch
decide(hist) → {WindowDesc[], dispatch_args, b_star, W_lo, W_hi, n_large}  // 1 wg
compact(msb_per_scalar, b_star) → idx_large[n_large]      // count + scan + scatter
   ── then, indirect-dispatched from dispatch_args ──
decompose_lower (n × W_lo)   decompose_upper (idx_large, n_large × W_hi)
transpose_lower              transpose_upper
   ── unified over all buckets ──
classify → radix → cumsum → partition → stream_walker → combine/size1/pt → reduce
```
No `mapAsync` between histogram and decompose. No O(n) host work.

## Staged implementation (validate every step)

**Phase 0 — table foundation + packed bid (byte-identical AND perf-neutral).**
Introduce `WindowDesc` (filled uniformly) and the packed-window bid; convert the
geometry-baking kernels to read them, ONE at a time, validating golden + a
same-M2 micro-bench (no `bid/BW` divide may appear) after each:
`decompose` (already `c`-parameterized) → `classify`/`csr_to_v2_meta` → transpose
count/scatter → `stream_walker` → `size1` → `combine_filter`/`combine_batched`/sort
→ `pt_finalize` → `reduce_level`. Regenerate `shaders.ts` after each WGSL edit.
*Exit:* every kernel reads `WindowDesc`; uniform fill = byte-identical golden at
logN 14/15/16/17 + D/E, and ≤1% bench delta.

*Status:* **0.1 done** (`ce2c4b02af`) — `WindowDesc` table + `decompose` reads it.
**0.2 done** (`01faf5fefc`) — packed-window bid (`(window<<15)|mag`) flipped across
every bid producer/consumer; decode is shift/mask, flat CSR index recovered via
`flat_bid(bid)=window*BW+mag`. `ba_unified_combine` needs no change (pt_buf indices,
no bid). **0.3 done** (`17b71ba7ac`) — the binning kernels (4 transpose +
`csr_to_v2_meta`) read per-window `num_columns`(WindowDesc[+5])/`work_off`(+3)
instead of the constant BW param; `csr_to_v2_meta` is now a 2D (window=gid.y) pass.
WindowDesc padded to numBatches·batchWindows rows for short-batch slots; scan
dispatches tbw to avoid OOB. `csr_to_v2_active_sums` is point-space → unchanged.
Validated golden+oracle 14–17, D/E, nb=2/3/5/4·E/3·D.
**0.4 done** (`a6b38604ab`) — `classify` 1D→2D (per-window geometry) + the 5 bid
consumers (`stream_walker`/`size1`/`combine_filter`/`combine_batched`/`pt_finalize`)
swapped to `work_off[gwin]+mag` / `reduce_off[gwin]+(mag-1)` table reads.
`window_desc` is a `var<uniform> array<vec4<u32>,256>` for the 3 at-cap kernels;
batch base reconciled as `work_off[gwin]-work_off[bwb]`. **0.5 done** (`2d0f6c8297`)
— host Horner combine folds with per-window widths; `?varsched=1` fixture
(`buildVarSchedule`, two-region 14×10|12×10) **PROVES** GPU==oracle under a
non-uniform schedule at logN 14/17, A/D/E, nb=2/3, E+nb=2. reduce_off stays padded
to `w*stride_max` so the reduce kernel + gather are unchanged; partial_* stays a
`window*BW_max` envelope hash. **Phase 0 COMPLETE: the pipeline is
variable-window-correct. `?varsched=1` is the variable-geometry regression test.**
*Next:* Phase 1 (the GPU decision kernel that CHOOSES the schedule — replaces the
host `buildVarSchedule` fixture).

**Phase 1 — GPU decision + schedule. DONE.** The decision was ported to TS
(`var_window_split.ts`) and to a GPU `decide` kernel, BOTH adapted to use the
GPU's `pickC` for window bits instead of the CPU `choose_window_bits` (so a
split's lower region == the unsplit `c` and NO_SPLIT is byte-identical). Pieces:
- `ba_msb_histogram` (`1d848a3be9`) — 256-bin MSB histogram + `msb_per_scalar`;
  matches the host oracle (A/C/E).
- `var_window_split.ts` (`1d848a3be9`) — `predictScheduleCost` /
  `chooseVarWindowSplit` / `buildVarWindowSchedule` + `buildWindowDescReference`;
  unit-tested (`var_window_split.test.ts`).
- forced-split create-time schedule (`03f41c3b83`) — oracle-agree at logN17
  A + profile-E empty-window stress; natural decision validated on real GPU data
  (A→no-split, C→split, D→no-split).
- `ba_decide_window_split` (`0b007749df`) — single-workgroup WGSL decision; its
  WindowDesc + summary match `buildWindowDescReference` exactly on A/C/D/E
  (the *exit criterion*). The 85% gate uses 17/20 to stay in u32.
Budget-awareness (reject schedules over the device budget) is deferred to Phase 3.

**Phase 2 — two populations.** `idx_large` GPU compaction **DONE** (`28595a8d2f`,
`ba_idx_large_compact`): compacts `msb >= b_star-1` via `msb_per_scalar`; count ==
decide `n_large`, every entry `msb >= b_star-1` (profile C), 0 for no-split.
*Remaining (2C/2D):* region-split + indirect-dispatch the decompose/transpose by
`n` / `n_large`, consume the decide kernel's WindowDesc at run time, switch
reduce/gather to per-window geometry, read back `windowCs` for the host combine.
*Exit:* D/E oracle-agree, uniform unchanged. **Key architectural note:** the
envelope `c` is always `pickC(n)` (data-independent → red_buf sizing stays
static); region-split is what keeps `bucket_and_sign` (`W_lo·n + W_hi·n_large`)
within the unsplit envelope; the bucket kernels (classify/radix/walker/combine/pt)
are already unified + indirect + window-agnostic so they need no change — only
decompose + the 4 transpose kernels are region-split, and reduce + the host gather
(which today hard-assume uniform `w·stride`) must read per-window geometry.

**Phase 3 — validate + bench.** Profiles A–E correctness + same-M2 perf vs the
current uniform path; confirm the D/E speedup. Then enable split by default behind
the budget-aware decision.

## Phase 2C/2D — implementation notes (turnkey)

The decision infra (Phase 1 + 2A + 2B) is done + pushed. Remaining is the
region-split data path. Note: **a forced split already computes correctly**
end-to-end (`?split=1&forcesplit=b,clo,chi` → oracle-agree, Increment 3) because
the existing pipeline runs all `n` over all windows; 2C is (a) make it
**data-driven** and (b) **region-split** so the upper region iterates only
`n_large` (the memory/perf win). Keep the default (`splitC` off) byte-identical at
every commit.

**bucket_and_sign two-region layout.** Lower: `[w·n + p]` for `w∈[0,W_lo)`,
`p∈[0,n)` (== today). Upper: `[W_lo·n + (w−W_lo)·n_large + j]` for
`w∈[W_lo,W_lo+W_hi)`, `j∈[0,n_large)`. Total `W_lo·n + W_hi·n_large ≤` unsplit
`NW·n` — the envelope bound.

**Kernels.**
- `decompose` (unchanged) runs the lower region + no-split, byte-identical.
- **NEW `decompose_upper`**: point source `idx_large[j]` (not `j`), writes at the
  upper base, `input_size=n_large`, global window = `W_lo + w`. Dispatch only when
  split.
- `transpose_count`/`transpose_scatter`: repurpose the **unused `params[1]`** as a
  `cci_base` (bucket_and_sign / val_idx region base): `cci_offset = params[1] +
  window·params[2]`; lower passes `params[1]=0` (byte-identical), upper passes the
  upper base + `params[2]=n_large`. `transpose_reduce`/`transpose_scan` are
  partials-only (work_off from WindowDesc) → no change IF `num_point_tiles` is
  **uniform across regions** (size it from `n`; the upper region just has empty
  trailing point-tiles — wasteful but keeps the partials layout `num_point_tiles·
  work_off_local` consistent).
- **`val_idx` mapping**: `transpose_scatter` for the upper region must store the
  ORIGINAL scalar index (`idx_large[j]`), not `j`, so the downstream point gather
  (`csr_to_v2_active_sums`) stays region-agnostic. Bind `idx_large` into
  `transpose_scatter` (upper dispatch only) and index through it.
- `csr_to_v2_meta` uses `params[1]=input_size` + `window·input_size` — make it
  region-aware (per-region input_size + base), same pattern.

**Sizing / timing.** `create()` with `splitC` sizes buffers to the split
envelope: `m.c = pickC(n)` (data-independent — `cLo` always == unsplit `c`), and
`numWindows = ` a cap (e.g. `min(128, 2·ceil(254/c))`). The data-dependent
schedule is decided at **prepare()** time: run histogram + decide (+ idx_large)
as a mini-submit, read back the decide summary (9 u32: `numWindows, W_lo, W_hi,
n_large, b_star, …` — O(windows), NOT O(n)), set `this.windowCs`/`numWindows`,
fill `windowDescBuf`, build the lower+upper region binds. `run()`/`encodeIntoBatch`
then dispatches lower (`n × W_lo`) + upper (`n_large × W_hi`) decompose/transpose,
unchanged bucket kernels, reduce + gather. (Indirect dispatch to remove the
prepare() readback bubble is a Phase-3 optimization; the schedule readback is tiny.)

**reduce + gather** can keep the envelope `reduce_off = w·stride_max` (uniform,
`stride_max = 2^(c−1)`) so the reduce kernel + host gather are unchanged; size
`red_buf` for the envelope `numWindows`. (Tight `Σ stride_k` is a later memory
optimization that needs per-window `reduce_off` in both reduce + gather.)

**host combine** reads back `windowCs` (already have it from the decide summary)
for the Horner fold.

**Validation.** Default byte-identical golden at every commit; then `?split=1`
natural split: profile C + D/E oracle-agree, uniform unchanged. Start with
`numBatches=1` (logN ≤ 17 — the golden/D/E sizes); multi-batch staging + split is
a follow-up (the `batchWindows`/`numBatches` interplay is create-time).

## Invariants / risks
- **Divide-free hot path** (rule 3) — re-check the compiled WGSL has no integer
  `/`/`%` by a runtime value in walker/combine/size1/reduce.
- **Perf-neutral uniform path** — Phase 0 adds a `WindowDesc` read per workgroup;
  bench it, don't assume.
- **`n_large` boundary** = `msb ≥ b_star - 1` (the `-1` is load-bearing — see the
  C++ comment at `:740`).
- **`msb` computed once** (histogram), reused by `idx_large`.
- Sort still correct under packed bids (verified: same relative order).
- Budget gate / staging driven by the **unsplit** envelope.
