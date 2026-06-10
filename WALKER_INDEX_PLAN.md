# walker_index rearchitecture — plan

Scope: the `walker_index` trace phase of MsMV2 — the 7 dispatches between
`stream_walker` and `combine_batched` that build the partials CSR index and
the N-sorted active-bucket list (`msm_v2.ts` `setPhase('walker_index')`
block). Goal: fully parallel, exact-width, near the bandwidth + launch floor
on M4 / Adreno (S25+) / Mali (Pixel 9A).

Baseline (N=2^17, phone traces, per-batch):

| sub-kernel (dispatch order) | Adreno | Mali |
|---|---:|---:|
| combine_count (131K slots) | 25 µs | 58 µs |
| combine_scan (1 WG over ~80K) | 176 µs | 394 µs |
| combine_scatter | 28 µs | 105 µs |
| combine_filter (87K wide) | 34 µs | 98 µs |
| sort_count (87K wide, ~16K live) | 32 µs | 139 µs |
| sort_scan (1 thread) | 6 µs | 26 µs |
| sort_scatter | 30 µs | 143 µs |
| inter-dispatch bubbles | ~1 µs | ~70 µs |
| **phase total** | **332 µs** | **1035 µs** |

Counters: Adreno ALU 4.9% (worst of any phase); Mali highest starvation /
lowest core-active of any phase. M4 baseline: captured in Stage 1.

## Contracts (frozen — other agents own the neighbours)

Inputs: `partial_dest[slot]` (slot→bid; walker writes `2*(t*S+k)+{0,1}`,
initialises only its dispatched range; tail at `[M_partials, M_partials+2)`
overlaid by residency counters), `partials_buf`, `sorted_bucket_list[0..num_dense)`,
`planner_meta` (num_dense at [1], walker indirect args at [15..17]),
`window_desc`, `batch_offset`.

Outputs (consumed by combine_batched / pt_* — bytes must keep meaning):
`partial_count[fb]`, `partial_offset[fb]` (opaque per-bucket region base into
`partial_layout`; monotonicity NOT relied on — verified no reader of
`partial_offset[num_dense]` and no cross-bucket assumptions), `partial_layout`
(slots, contiguous per bucket, in-bucket order already nondeterministic
today), `active_count`, `sorted_active_buckets` (pure bids, ascending-N
bins), `bin_offsets[64]`, `pt_dispatch_args` / `pt_persistent_args` /
`cb_dispatch_args`, `red_buf` singles copies, `is_present` marks for every
dense bucket.

Determinism note: bump allocation makes `partial_offset` values
run-nondeterministic (in-bucket layout order already is). Final `red_buf`
bytes are unchanged: per-bucket sums are exact abelian group ops, order
independent. Validation gates on red_buf/result, not on partial_* bytes.

## v1 design — 5 dispatches, all exact-width, no serial stage

```
W1 idx_count    width = live slot range (indirect; planner emits args)
                vec4 loads of partial_dest; atomicAdd partial_count[fb];
                WG-aggregated bump → compact (slot,bid) pairs + live_count header.
W2 idx_alloc    width = ceil(num_dense/TPB) (indirect)
                per dense bucket: count==0 → is_present mark only;
                count>=1 → offset via in-WG prefix + one global bump/WG,
                bit31 of offset flags count==1 (singles);
                count>=2 → append (bid,n) to actives (WG-aggregated)
                + WG-shared 64-bin histogram, flushed once per WG;
                is_present mark for all.
E  idx_epilogue 1 WG × 64 threads
                bin_offsets = excl scan of histogram (shared mem);
                zero bin_write_pos; emit pt/cb args (as sort_scan today)
                + W3 args from live_count + W5 args from active_count;
                partial_offset[num_dense] = total (compat, nothing reads it).
W3 idx_scatter  width = live_count (indirect)
                coalesced (slot,bid) pair reads; pos via atomicAdd
                partial_write_pos[fb] (skip when single);
                partial_layout[offset+pos] = slot;
                offset bit31 set → copy partials_buf→red_buf inline (singles).
W5 idx_sort     width = active_count (indirect)
                (bid,n) coalesced; per-bin rank via WG-shared 64 counters,
                one global flush per (WG,bin); write sorted_active_buckets.
```

DAG: W1 → W2 → E → {W3, W5}. Dependency depth 4, every dispatch wide,
zero single-thread stages, every global counter goes through one
workgroup-level aggregation (Mali).

Also:
- `partition_task` (planner, 1 small kernel edit) additionally emits W1/W2
  indirect args (it already emits the walker's at planner_meta[15..17]).
- The per-batch 512 KB `clearBuffer(walkerPartialDest)` dies on the v2 path:
  W1's exact width never reads beyond the walker-initialised range.
- active_buckets format becomes (bid,n) pairs — legal: only the sort kernels
  read it (combine_batched reads sorted_active_buckets, verified).
- Old path stays behind `walkerIndexV2` config flag until gates pass.

Binding budget per kernel ≤ 10 storage (phones proven at 10 by today's
filter). W1=4, W2≈8, E≈9, W3≈9, W5≈6.

Expected: Mali ~1035 → ~150 µs, Adreno ~332 → ~80 µs.

## Stage gates

**S1 instrument + baseline.** wi_* sub-phase labels on all 7 dispatches
(+ BATCH_STAGE_ORDER); stats readback mode (num_dense, total partials =
partial_offset[num_dense], active_count, histogram[64], singles via
partial_count readback); M4 per-subkernel baseline at logn 14/17/20.
Gate: numbers recorded in WALKER_INDEX_RESULTS.md.

**S2 v1 implementation.** Templates + wiring behind flag.
Gates: (a) msm-cross-check green at logn 10/14/17 × scalar profiles,
(b) red_buf byte-compare v1-vs-baseline where applicable / result equality,
(c) M4 A/B shows phase win with no regression elsewhere.

**S3 tighten + phones.** TPB (128 vs 256 on Mali), vec4 widths, optional
last-WG-ticket E-fold and subgroup A/B — each measured, kept only if it wins
on the device that motivated it. One profile_both.sh run; compare against the
baseline traces per sub-kernel. Gate: ≥3× Adreno, ≥5× Mali phase total.

**S4 analytic index.** Model: cuts are monotone in cumulative-add space and
analytic per (t,k); cuts inside bucket b form contiguous range
[j_lo(b), j_hi(b)); count = j_hi-j_lo+1 (if >0); partial j of b ↔ cut
j_lo+j ↔ slot 2*(task)+{0,1} — atomic-free rank-exact CSR in one D-wide
kernel (W2′ → E → W5, 3 dispatches, no M-wide pass, no partial_dest read).
Gate: validator comparing analytic CSR vs partial_dest-derived ground truth,
green across profiles A–E × logn 10–20 × all 3 devices, including
degenerates (empty tasks, coincident cuts, single-bucket threads). Flag
default flips only on full green; otherwise v1 ships and S4 lands as
experiment + handoff notes.

## Risks

| Risk | Mitigation |
|---|---|
| WGSL relaxed atomics: cross-WG non-atomic data invisible without barrier | No ticket patterns in v1; E is its own dispatch. Ticket = S3 experiment only, args-only via atomics. |
| Walker emission semantics drift vs analytic model | S4 gated on validator across all profiles/devices; v1 keeps partial_dest ground truth. |
| Storage-buffer caps (8 on weakest mobile configs) | Budgeted ≤10 like today's filter (proven on both phones); arena-monolith binding trick if a kernel busts. |
| Multi-batch / split-c / union paths | All new kernels keep window_desc + batch_offset addressing; per-batch clears for new counters added to existing clear block; gates run split-c configs too. |
| dx=0 affine-add edge from changed combine order | Same risk class as today's in-bucket nondeterminism (random points); noted, not mitigated. |
| Bench interference from sibling agents | bench-lock.sh mac/phones acquire-wait-release, always. |

## Deliverables

- WALKER_INDEX_RESULTS.md: baseline + per-stage A/B numbers (M4 + both phones).
- Commits per stage (Conventional Commits), old path removed only after S3
  gate (or kept if S4 flips analytic on).
