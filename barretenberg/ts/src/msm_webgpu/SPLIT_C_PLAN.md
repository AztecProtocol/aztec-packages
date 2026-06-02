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

One storage buffer, ≤128 entries (`VAR_WINDOW_MAX_WINDOWS`). Per window `w`:

```wgsl
struct WindowDesc {        // 20 B → pad to 32
  window_bits : u32,       // c_w
  bit_base    : u32,       // Σ_{k<w} c_k  (start bit in the scalar)
  num_buckets : u32,       // 2^(c_w-1) + 1
  work_off    : u32,       // prefix sum of num_buckets — bucket-id base in PASS space
  reduce_off  : u32,       // prefix sum of stride_w = 2^(c_w-1) — red_buf base
}
```
`region` (lower/upper) and `point source` (identity vs `idx_large`) are derived
from `w < W_lo`. **`no-split = uniform fill`**: `window_bits=c`, `bit_base=w·c`,
`num_buckets=2^(c-1)+1`, `work_off=w·BW`, `reduce_off=w·STRIDE` → every kernel
reproduces today's output exactly.

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
no bid). Validated golden+oracle 14–17, D/E, nb=2/5/4·E. *Remaining:* swap the two
uniform-geometry const-multiplies for table reads (`window*BW`→`work_off[window]`,
`window*STRIDE`→`reduce_off[window]`) per kernel, plus `csr_to_v2_meta`/transpose
`num_columns`/`bit_base`. NOTE: `stream_walker` is at the 10-storage-binding cap, so
its `window_desc` must be a `var<uniform>` (the work_off/reduce_off swap is a no-op
on the uniform path, so it can wait until variable geometry exists in Phase 1).

**Phase 1 — GPU decision + schedule.** `histogram` kernel (+`msb_per_scalar`),
`decide` kernel (port `choose_var_window_split`/`build_var_window_schedule`/
`predict_schedule_cost`, incl. budget-awareness: reject schedules whose envelope
bytes > the device budget). Fill `WindowDesc` from the schedule. NO_SPLIT path
stays byte-identical; force a SPLIT schedule on a known input and check
oracle-agree. *Exit:* the decision matches the C++ reference on a fixed histogram
(unit-test the kernel against `choose_var_window_split` outputs).

**Phase 2 — two populations.** `idx_large` GPU compaction (reuse `msb_per_scalar`);
region-split + indirect-dispatch the decompose/transpose by `n` / `n_large`.
*Exit:* D/E oracle-agree, uniform unchanged.

**Phase 3 — validate + bench.** Profiles A–E correctness + same-M2 perf vs the
current uniform path; confirm the D/E speedup. Then enable split by default behind
the budget-aware decision.

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
