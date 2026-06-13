# Plan: bank the l0_base walker saving (scatter-fold)

## ⚠️ ALL NUMBERS BELOW ARE ON THE WRONG MONTMUL — RE-BASELINE FIRST
The l0_base measurements were taken on `montmul=cios_native` (~98 ms), which was a
MISREAD of "cios-13". The real optimal config is **`montmul=cios_unrolled`** (~85 ms warm,
GPU-span ~82 ms; the cap-trace config), with **mpw=32** (beats mpw64) and the default
WORD_SIZE=13 (`wordsize` URL param is a no-op). **cios_native has been removed from the
branch entirely** (it's no longer a MontMulVariant). So: re-baseline the l0_base eval on
`montmul=cios_unrolled` before trusting the ~5 ms saving figure — the gather is montmul-
independent so the saving should persist (and be a bigger % of a faster walker), but the
numbers must be re-taken. Baseline reads cold (~380 ms rep-0 / compile bleed); use warm
reps (trace=1 + no_wasm + reps≥12, parse passTimes GPU-span like the cap rows).

## Context / what's measured (was cios_native; REDO on cios_unrolled, logn17, S25 Adreno)
- The walker resolves a bucket's l0_index base via an unprefetchable dependent gather
  `sorted_bucket_list[i] -> flat_bid(.) -> offsets[.]` at init (per slot) and at every
  bucket transition. Precomputing it into `l0_base[i]` makes the walker read **~5 ms faster**
  (98.7 ms vs Variant C's 103.8 ms).
- BUT the precompute currently runs as a **separate `resolve_l0base` dispatch (~6 ms)** which,
  because Adreno serializes dispatches (no overlap — measured), cancels the walker saving.
  Net: v2 ≈ baseline (neutral).
- **Goal: remove the separate dispatch so the ~5 ms walker saving lands net.**

## Current code state (branch zw/msm-webgpu-experiments-v2, worktree wt-memory)
- `l0_base` is a **dedicated buffer** (`scratch.l0BaseBuf = sbuf(batchBuckets*4)`), bound to the
  walker's binding-2 slot (the old `offsets`/`flat_bid` gather is removed). NOT an arena_a0
  sub-range — parking it in A0 cost ~30 ms (register/cache contention on the hot loop); that was
  the slop, now fixed.
- A separate kernel `ba_planner_resolve_l0base.template.wgsl` writes `l0_base[i] =
  offsets[flat_bid(sorted_bucket_list[i])]`, dispatched after partition_task (msm_v2.ts run loop).
- Correct: cross-check agrees on profiles A, D, E (and default) at logn14/17.

## The fix: fold l0_base resolution into the FINAL radix-scatter pass
The final radix-scatter (`ba_planner_radix_scatter`) already writes `sorted_bucket_list[dst] = bid`
and `sorted_count_list[dst] = count` in final count-sorted order, one thread per bucket, in
parallel. Add, **in the final pass only**, `l0_base[dst] = offsets[flat_bid(bid)]`. Then:
- the resolution is computed during an existing pass (no added dispatch, no Adreno serialization tax),
- the walker reads `l0_base[dst]` exactly as now,
- the ~5 ms walker saving is banked instead of eaten by the resolve.

### Implementation steps
1. **Delete the separate resolve path**: `ba_planner_resolve_l0base.template.wgsl`, its
   shader_manager gen + import, `resolveL0BasePipe/Layout/Binds` fields, layout, compile, bind,
   and the dispatch call in the run loop. Keep `l0BaseBuf` (the dedicated buffer) and the walker's
   binding-2 read — those stay.
2. **Modify `ba_planner_radix_scatter.template.wgsl`**: add bindings for `offsets` (the final CSR
   offsets), `window_desc`, and `l0_base` (rw). Add a `params` flag `is_final_pass`. Where the
   scatter writes the sorted bucket to `dst`, if `is_final_pass`, also compute and write
   `l0_base[dst] = offsets[flat_bid(bid)]` (copy flat_bid in: WBID_SHIFT/MASK, WD_STRIDE=8,
   wd_work_off(g)=window_desc[g*8+3], minus the batch base, plus mag).
   - The 3 radix passes ping-pong src/dst; the **final** pass writes the real sorted order, so set
     `is_final_pass=1` only on radixScatterBinds[2] (verify which index is final — walker reads
     offsetsBufs[0], sortedBucketList).
   - `offsets` here = offsetsBufs[0] (the final post-radix CSR offsets the walker reads). Confirm
     the offsets are final BEFORE the last scatter (they're produced by classify; the radix passes
     reorder buckets, not the CSR offsets — double-check this ordering, it's the one correctness
     risk).
3. Regenerate `wgsl/_generated/shaders.ts` (`node src/msm_webgpu/scripts/inline-wgsl.mjs`).
4. The querySet-overflow and resolve-over-dispatch slop both become **moot** (no extra pass).

### Correctness risk to watch
`flat_bid(bid)` indexes the CSR `offsets`. Confirm that at the final scatter, `offsets` already
holds the final base for each bid (i.e. the CSR offsets are bid-indexed and stable across the radix
reorder, which only permutes the sorted *list*, not the CSR). If offsets aren't final until after
the scatter, fold into the cumsum pass instead (it runs after the sort, reads sorted_count_list per
bucket — but it's 1-WG serial, so the gather would serialize; prefer scatter if offsets are ready).

## Validation
- Cross-check (WebGPU vs WASM) agrees on profiles A, D, E at logn14 AND 17 (byte-identical output).
- Interleaved A/B vs baseline on a COOL phone (cios_native+mpw32+pk14): expect ~5 ms win on A,
  larger on D (transition-heavy). Phone runs are thermally + connection flaky — cool first, keep
  screen awake (no KEYCODE_SLEEP — it drops wireless adb), retry NORESULT.

## RESOLVED: the 88 ms config
`~/localclaudebox/phonetests/s25_oversub_max64_labeled.perfetto` (+ `cap_s25_oversub.sh`,
`s25_oversub_max64_row.json`, `s25_oversub_max32_row.json`) were made with:
`montmul=cios_unrolled` (NOT cios_native — the misread), default WORD_SIZE=13 (`wordsize=13`
URL is a no-op), `no_wasm=1&trace=1&reps=140`, mpw set in `ba_stream_plan.ts` source.
- "88 ms" = the **passTimes GPU-span** metric, not wall. max64 GPU-span median 89.9, max32 82.5
  → **mpw=32 is FASTER than mpw64** (the max64 trace is the slower of the two; matches the
  "Adreno oversub regresses" memory note). max32 wall: min 85.2, median 102.4.
- So the optimum is **cios_unrolled + mpw32**, ~82 ms GPU / ~85 ms wall warm.
- cios_native (my ~98 ms baseline) has been DELETED from the branch. Re-baseline l0_base on
  cios_unrolled (see the warning block at top).
