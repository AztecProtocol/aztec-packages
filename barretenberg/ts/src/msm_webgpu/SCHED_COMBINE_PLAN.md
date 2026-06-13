# Schedule-driven combine (addition schedule)

The combine stage executes a precomputed per-bucket binary addition tree
("addition schedule") instead of discovering pairs per dispatch. The
walker-index chain already produces everything the schedule needs; the
executors are dumb: they stream `(src, src, dst)` entries and add points.

## Inputs (walker_index, unchanged)

- `partials_buf`: plane-separated affine partials. X of slot `s` at
  `vec4` index `PG*s`, Y at `PG*M + PG*s` (PG=2, M = partials plane stride
  = `2*streamNumThreads*streamS`).
- `partial_layout` (arena A2 @ `arena_off.y`): per-bucket contiguous list
  of partial SLOT indices; base = `partial_offset[fb] & 0x7fffffff`.
  In-bucket order nondeterministic (scatter atomics) — sums are
  order-independent.
- `partial_count[fb]` exact counts; `sorted_active_buckets` (bids, bins
  ascending by capped count, `bin_offsets[64]`, cap bin = 63);
  `count_histogram[64]`; `active_meta = [active_count, P_total]`.
- Buckets with one partial / one point never reach the combine
  (scatter / size1 fast paths). `is_present` is set upstream (classify +
  size1).

## The schedule

Tree pairing is closed-form on positions (in-place writes never move a
value between positions): at layer `k`
(1-based), pairs are `(rel, rel + 2^(k-1))` for `rel ≡ 0 mod 2^k`,
partner-in-range. Therefore every entry — sources, destination, z-slots,
root detection — is pure bit arithmetic on `(cnt, rel, k)` plus
`partial_layout` lookups. The emitter holds no state.

Entry = one `vec4<u32>`, 16 B, layer-major:

- Affine layer (`k < boundary`):
  `{srcA_slot, 0, srcB_slot, dst}` where `dst = srcA_slot`, or
  `RED_FLAG | red_slot` (bit 31) when this add closes its bucket
  (`rel == 0 && cnt <= 2^k`) — the affine root writes red_buf directly.
- Projective layer (`k >= boundary`):
  `{srcA_slot | PROJ?, srcA_zslot, srcB_slot | PROJ?, srcB_zslot}`.
  dst is implicit: X3,Y3 -> srcA's slot, Z3 -> srcB's X cell (the slot
  this very entry frees). PROJ (bit 31) marks a source produced in the
  projective region (load its Z); otherwise Z := Montgomery 1 (register
  constant, no load).
  A source's z-slot = the partner slot of its LAST pairing (closed form);
  never-paired sources (the odd-orphan chain) are affine by construction.

Layer totals: `adds(m, L) = floor(ceil(m / 2^L) / 2)` summed over the
histogram (bins 1..62 exact) + cap-bin buckets (exact counts, small set).
Cursor for bucket `i`, layer `L`:
`layer_base[L] + bin_layer_base[bin][L] + rank_in_bin * adds(bin_n, L) + j`
(rank = sorted position − bin_offsets[bin]); cap-bin buckets use a
scanned per-bucket prefix table. All deterministic per run.

Projective-rooted buckets (depth > boundary) additionally emit a
normalize entry `{root_xy_slot, root_z_slot, red_slot, 0}`; cursors by
the same rank trick over the count-suffix.

## Execution

- `sched_affine` (one dispatch per affine layer, indirect): S=8 entries
  per thread, batched-affine incomplete add (dlog ruling), identity-dx
  idle slots, ONE multiplier call site (level-kernel discipline), peel
  writes `dst`. Layer 1 is always affine.
- `sched_coop2` (one dispatch per projective layer, indirect): 2 subgroup
  lanes per entry, the ufold's complete RCB homogeneous add
  (`padd_vm` microcode, lazy/loose adds) lifted verbatim; X3/Y3/Z3 stored
  in standard 8×u32 form to the slots above.
- `sched_normalize` (one dispatch): batched inversion over all
  projective roots (C=8 prefix chain, one pk14 inverse per thread),
  x = X·z⁻¹, y = Y·z⁻¹ into red_buf. Kills per-root inversions.

Boundary = first layer whose add count drops below a starvation
threshold (occupancy arithmetic, smooth cost both sides; baked constant
tuned by A/B). The planner (`wi_sched_plan`, one workgroup after the
sort) computes totals, boundary, bases, bin tables and every indirect
dispatch arg; the emit kernel (one thread per active bucket × layer,
`dispatch(ceil(active/TPB), MAX_LAYERS, 1)`) writes entries.

MAX_LAYERS = 18 (counts ≤ P < 2^18). Empty layers dispatch zero
workgroups via indirect args.

## Memory

Schedule meta + cap prefix table + entries + normalize list live at the
top of the ptScratch slot (~3 MB at full geometry). Z values occupy freed
partial X-cells; no new point storage.

## Validation

- `schedcheck=1`: a schedEmitOnly instance leaves the partial planes
  pristine; JS reconstructs the expected schedule bit-for-bit (planner +
  emitter mirror) and replays every bucket in bigint against a
  normal-mode instance's red_buf snapshotted with `halve_stop=0` (the
  in-place reduce mutates red_buf after the combine).
- End-to-end: WASM cross-checks across sizes, seeds and scalar shapes
  (uniform / clustered / monster / witness); `ab=det` compares staged
  bytes across two instances on one pool.
