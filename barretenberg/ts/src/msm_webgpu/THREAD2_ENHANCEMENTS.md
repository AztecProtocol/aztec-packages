# Thread 2 (high-mem A/B ping-pong) — enhancement backlog

The Thread-2 high-memory A/B ping-pong bucket-sum path is **merged, correct, and
one-program**: byte-identical to the WASM oracle on the single-MSM path and on the
union path (homogeneous *and* mixed-N), gated behind `MsmConfig.pingpongBelow` /
`?ppbelow=N` / `?himem=1`, **default off**.

It is **default off because it is perf-neutral on M2**. The 1.7–1.8× "win" first
reported was a measurement artifact of `msm-bench`'s `profile=true` mode (it sums
per-dispatch timestamp deltas, which scales with dispatch count and penalises the
walker's ~54 dispatches vs the ping-pong's ~30). Measured with `profile=false`
(wall-around-submit, via `msm-batch-bench`), high-mem ≈ walker at every n and for
batched unions. See `MERGE_STRUCTURE_HANDOFF.md` and the memory note
`msm-webgpu-profile-true-inflates-by-dispatch-count`.

Everything below is **optional**. None is required for the merge; the path is
complete and validated as-is. Items are ordered by value given the perf reality.

---

## A. Mobile / dispatch-bound device characterization — *highest potential value*

**What.** The ping-pong's one structural advantage is that it issues roughly half
the walker's dispatches. On M2 that buys nothing (GPU compute dominates), but on
GPUs where CPU-side command-encode/submit overhead dominates — mobile Adreno /
Mali — fewer dispatches can be a real wall-clock win. This is the only place the
ping-pong might actually beat the walker.

**Why deferred.** This session was M2-only. Untested on-device.

**How.** Deploy to a Pixel (Adreno) and a Mali device, bench `profile=false`
(wall-around-submit) high-mem vs walker across small n and small batch K, per the
phone-bench harness. Watch `?ppbelow=N` routing. If it wins, set a per-device
`pingpongBelow` default.

**Effort:** moderate (device deploy + bench). **Value:** potentially the only real
perf win for Thread 2.

---

## B. Coop-tail dispatch (`ba_fused_tail_coop`) — *compiled but never dispatched*

**What.** The cooperative deep-tail kernel is ported, compiled, and bound
(`coopTailPipe`, reusing `finalizeAccumLayout`), but `coopTailLevel` is pinned to
`-1`, so the per-level loop runs every level instead of collapsing the starved
deep tail (one workgroup per hot bucket reduces its ≤CAP remaining points in
workgroup memory in a single dispatch).

**Why deferred.** Correctness-first; the per-level loop is correct without it.

**How.** Port the host `coopTailLevel` computation (source `msm_high_memory.ts`:
the `aggMax ≤ COOP_TAIL_CAP && aggActive ≤ COOP_TAIL_STARVE` trigger over the
walk), then in `encodeIntoBatch` short-circuit the level loop at `coopTailLevel`
with one `coopTailPipe` dispatch and `break`. Constants `COOP_TAIL_WG/CAP/STARVE`
already exist.

**Effort:** low–moderate. **Value:** fewer deep-tail dispatches — marginal on M2,
but compounds with (A) on dispatch-bound devices.

---

## C. `fastPathRewrite` of the ping-pong uniforms — *prepare latency*

**What.** The fast path is disabled when `highMemPingpong` (the `fits` check has
`!this.highMemPingpong`), so every prepare rebuilds all bind groups (the dominant
per-MSM cost; ~tens of ms on the slow path). The per-level ping-pong binds are
data-dependent (levels + per-level pair/carry counts vary with the histogram), so
the source rewrites the per-level uniforms in place instead of rebuilding.

**Why deferred.** Correctness-first; rebuild-every-prepare is correct, just slower
to prepare.

**How.** Extend `fastPathRewrite` to re-write `plannerParams`/`carryParams`/
`tileParams`/`finalizeParams` for each level when the plan still fits the cached
caps (`capLevels`/`capTotalPairBlocks`/`capTotalCarries`), then drop the
`!this.highMemPingpong` clause from `fits`.

**Effort:** moderate. **Value:** prepare latency for repeated same-size MSMs.

---

## D. Mixed-c unions — *currently fall back to the walker*

**What.** A union whose members have different `c` (window width) falls back to the
walker (`uniformC` is false). `reduce_init` bakes a single STRIDE, so a per-window
stride is needed to repack a mixed-c `bucket_result` into `red_buf`.

**Why deferred.** It does not bite in practice: the auto-gate only fires when the
super-instance n ≤ `pingpongBelow` (all-small unions), and all-small members share
`c=8`, so the gate regime is always uniform-c. Mixed-c only arises when mixing
small + large members, but then n > threshold and the gate is off anyway.

**How.** Make `ba_reduce_init` read per-window stride/`reduce_off` from
`window_desc` (as the walker's reduce already does) instead of the baked
`params.y`. Then drop the `uniformC` restriction for the union.

**Effort:** moderate (reduce_init kernel + bind). **Value:** low (not reachable by
the current gate).

---

## E. Multi-chunk (point-chunking) + split-c — *large-N reach*

**What.** The host walk currently runs a **single point-chunk** (all n) and falls
back for single-MSM split-c. The source point-chunks the input when the active-sum
working set M exceeds the memory budget, and `finalize_accumulate` already supports
it (the `touched` flag makes the first chunk copy and later chunks affine-add).

**Why deferred.** Small n (the gate regime) fits one chunk and is uniform-c; this
only matters if the gate is ever extended to large n.

**How.** Port the source `walkAtM`/`numChunks` chunk loop into `prepare()` +
`encodeIntoBatch` (per-chunk convert + level loop, accumulating into
`bucket_result`); for split-c, build per-member/per-window `c` segments (the host
walk already takes `HistSegment[]`).

**Effort:** moderate–high. **Value:** low while the gate is small-N.

---

## F. Full `estimateMem` integration — *budget correctness at scale*

**What.** `footprint()` counts the revived `bufA`/`bufB`/`bucketResult`/`touched`/
rings, but `estimateMem` (the `numBatches` budget gate) does not.

**Why deferred.** Moot in the gate regime: small n ⇒ `numBatches == 1` and the
buffers are a few MB.

**How.** Add the high-mem buffer terms to `estimateMem` when `highMemPingpong`.

**Effort:** low. **Value:** low (only matters if the gate extends to large n with
`numBatches > 1`).

---

## G. `pickS` discrete-S tuning — *marginal, tension with one-program*

**What.** `HIGH_MEM_S` is fixed at 2 for one-program. The n-optimal S varies
(2 @ logN10, 4 @ logN14); a small discrete set (e.g. `S = n < 2^12 ? 2 : 4`) keyed
by a coarse n-bucket would shave ~1.5ms at logN14 at the cost of a second compile.

**Why deferred.** One-program is a hard branch invariant, and the perf-neutral
finding makes the gain not worth breaking it.

**Effort:** low. **Value:** marginal; only if a device benchmark (A) shows S
matters there.

---

## Out of scope (not Thread 2): `ba_walker_pt_coop_tail`

The one `wt/structure` kernel that is a genuine *walker* optimization (a
cooperative pair-tree tail for the stream-walker's hot buckets) was **not** part of
either merge thread — the walker core is the shared baseline. It could improve the
walker's profile-E deep tail and is worth a separate look, but it is independent of
the high-mem port.
