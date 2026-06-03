// Optimal walker_combine helper: filter active combine buckets.
//
// After the count kernel, most dense buckets have partial_count == 0 (they
// were fully consumed within one walker task and emitted directly to
// red_buf). Some have count == 1 (single partial = no add needed). Only
// buckets with count >= 2 require combining.
//
// One thread per dense bucket. If count >= 2, the bucket's id is appended
// to active_buckets via atomicAdd on active_count. If count == 1, the
// single partial is COPIED into red_buf at the bucket's unified reduce slot
// in this kernel (one less stage).
//
// After this kernel:
//   - active_buckets[0 .. active_count) holds bucket_ids needing real combine
//   - red_buf[red_slot(bid)] = the single partial for any bucket with count == 1
//
// bid is the packed-window id (window << 15 | mag). red_slot =
// (window + batch_offset) * STRIDE + (mag - 1). Flat CSR index for the
// partial_* arrays is window*BW + mag = flat_bid(bid).
// (See UNIFIED_COMBINE_PLAN.md §Phase 2, SPLIT_C_PLAN.md for the bid encoding.)
//
// params.x = num_dense
// params.y = M_partials   (partials_buf plane stride)

const PG: u32 = 2u;
const BW:     u32 = {{ bw }}u;
const STRIDE: u32 = {{ stride }}u;
// M_RED (red_buf Y-plane stride) is runtime in batch_offset.z (= Σ redM packed,
// = this MSM's redM otherwise — byte-identical to the old baked M_RED).
// Packed-window bid (SPLIT_C_PLAN.md): bid = (window << WBID_SHIFT) | mag.
const WBID_SHIFT:    u32 = 15u;
const WBID_MAG_MASK: u32 = 0x7fffu;

const TPB: u32 = {{ workgroup_size }}u;

// Flat CSR index (partial_* space) for a packed-window bid.
fn flat_bid(bid: u32) -> u32 {
    return (bid >> WBID_SHIFT) * BW + (bid & WBID_MAG_MASK);
}

@group(0) @binding(0) var<storage, read>       sorted_bucket_list: array<u32>;
// arena_a2: the WHOLE colour-A2 arena (monolith). partial_count and partial_layout
// are read-only sub-ranges of it, addressed via arena_off (.x, .y). Binding the
// monolith once (vs two sub-ranges) frees the slot that lets window_desc be a
// storage buffer ⇒ no window cap. Same arena bytes. (partial_offset is A5 ⇒ kept.)
@group(0) @binding(1) var<storage, read>       arena_a2:           array<u32>;
@group(0) @binding(2) var<storage, read>       partial_offset:     array<u32>;
@group(0) @binding(3) var<storage, read>       partials_buf:       array<vec4<u32>>;
@group(0) @binding(4) var<storage, read_write> red_buf:            array<vec4<u32>>;
@group(0) @binding(5) var<storage, read_write> active_buckets:     array<u32>;
@group(0) @binding(6) var<storage, read_write> active_count:       atomic<u32>;
@group(0) @binding(7) var<uniform>             params:             vec4<u32>;
@group(0) @binding(8) var<storage, read>       planner_meta:       array<u32>;
@group(0) @binding(9) var<storage, read_write> is_present:        array<u32>;
// batch_offset.x = bi * batchWindows — added to local window index for red_slot.
@group(0) @binding(10) var<uniform>             batch_offset:      vec4<u32>;
// WindowDesc as a STORAGE array<u32> (full stride-8 rows): reduce_off = u32 +4.
// Storage (the A2-monolith bind freed the slot) ⇒ no fixed-size window cap.
@group(0) @binding(11) var<storage, read>      window_desc:        array<u32>;
// arena_off: u32 element offsets within arena_a2 — .x = partial_count, .y = partial_layout.
@group(0) @binding(12) var<uniform>            arena_off:          vec4<u32>;
const WD_STRIDE: u32 = 8u;
fn wd_reduce_off(g: u32) -> u32 { return window_desc[g * WD_STRIDE + 4u]; }
fn pc_at(i: u32) -> u32 { return arena_a2[arena_off.x + i]; }   // pc_at(i)
fn pl_at(i: u32) -> u32 { return arena_a2[arena_off.y + i]; }   // partial_layout[i]

// Workgroup-shared buffer for collecting active bucket ids locally.
// Single global atomic per workgroup (NOT per active bucket) — friendly to
// mobile GPUs that serialize global atomics aggressively.
var<workgroup> wg_active_buf: array<u32, {{ workgroup_size }}>;
var<workgroup> wg_active_count: atomic<u32>;
var<workgroup> wg_base_offset: u32;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>,
        @builtin(local_invocation_id) lid: vec3<u32>) {
    let t = gid.x;
    let l = lid.x;
    // num_dense lives in planner_meta[1] (written by ba_planner_classify).
    // The CPU side bounds dispatch by an UPPER limit (B_TOTAL); using
    // params.x as num_dense over-counts trailing zero slots as active
    // bucket 0, which catastrophically corrupts sorted_active for
    // high-N-bucket-0 profiles (D/E).
    let num_dense = planner_meta[1];

    // One thread per dense bucket (over-dispatched; trailing threads no-op).
    if (l == 0u) { atomicStore(&wg_active_count, 0u); }
    workgroupBarrier();

    if (t < num_dense) {
        let bid = sorted_bucket_list[t];
        let fb = flat_bid(bid);
        let count = pc_at(fb);

        // Magnitude (bid & WBID_MAG_MASK) is guaranteed in [1, STRIDE] —
        // ba_planner_classify filters out zero-digit and BW-padding buckets
        // before they reach sorted_bucket_list.
        {
            // EVERY dense bucket gets is_present pre-marked, unconditional on
            // partial_count: stream_walker may have whole-retired this bucket
            // (partial_count == 0, red_buf already populated). combine_batched
            // and pt_finalize then only write coordinates, not flags.
            // Unconditional mark also keeps combine_batched within M2's 10-
            // storage cap (no is_present binding needed there).
            let window = bid >> WBID_SHIFT;
            let mag = bid & WBID_MAG_MASK;
            let red_slot = wd_reduce_off(window + batch_offset.x) + (mag - 1u);
            is_present[red_slot] = 1u;

            if (count == 1u) {
                // Single partial — copy directly to red_buf.
                let M_partials = params.y;
                let slot = pl_at(partial_offset[fb]);

                let bx = PG * red_slot;
                let px0 = partials_buf[PG * slot + 0u];
                let px1 = partials_buf[PG * slot + 1u];
                red_buf[bx + 0u] = px0;
                red_buf[bx + 1u] = px1;

                let by = PG * batch_offset.z + PG * red_slot;
                let py0 = partials_buf[PG * M_partials + PG * slot + 0u];
                let py1 = partials_buf[PG * M_partials + PG * slot + 1u];
                red_buf[by + 0u] = py0;
                red_buf[by + 1u] = py1;
            } else if (count >= 2u) {
                // Stash bid in workgroup buffer; the global atomic is one per WG below.
                let local_idx = atomicAdd(&wg_active_count, 1u);
                wg_active_buf[local_idx] = bid;
            }
            // count == 0: stream_walker whole-retired; red_buf already
            // has the data, is_present is now marked. No further work.
        }
    }
    workgroupBarrier();

    // ONE global atomicAdd per workgroup (vs per-active-bucket previously).
    let wg_count = atomicLoad(&wg_active_count);
    if (l == 0u && wg_count > 0u) {
        wg_base_offset = atomicAdd(&active_count, wg_count);
    }
    workgroupBarrier();

    // Each thread writes one entry from the workgroup buffer to the global
    // active_buckets array. Coalesced contiguous writes.
    if (l < wg_count) {
        active_buckets[wg_base_offset + l] = wg_active_buf[l];
    }

    {{{ recompile }}}
}
