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
// red_slot(bid) = (bid / BW) * STRIDE + (bid % BW - 1)
// (See UNIFIED_COMBINE_PLAN.md §Phase 2.)
//
// params.x = num_dense
// params.y = M_partials   (partials_buf plane stride)

const PG: u32 = 2u;
const BW:     u32 = {{ bw }}u;
const STRIDE: u32 = {{ stride }}u;
const M_RED:  u32 = {{ m_red }}u;

const TPB: u32 = {{ workgroup_size }}u;

@group(0) @binding(0) var<storage, read>       sorted_bucket_list: array<u32>;
@group(0) @binding(1) var<storage, read>       partial_count:      array<u32>;
@group(0) @binding(2) var<storage, read>       partial_offset:     array<u32>;
@group(0) @binding(3) var<storage, read>       partial_layout:     array<u32>;
@group(0) @binding(4) var<storage, read>       partials_buf:       array<vec4<u32>>;
@group(0) @binding(5) var<storage, read_write> red_buf:            array<vec4<u32>>;
@group(0) @binding(6) var<storage, read_write> active_buckets:     array<u32>;
@group(0) @binding(7) var<storage, read_write> active_count:       atomic<u32>;
@group(0) @binding(8) var<uniform>             params:             vec4<u32>;
@group(0) @binding(9) var<storage, read>       planner_meta:       array<u32>;
@group(0) @binding(10) var<storage, read_write> is_present:        array<u32>;
// batch_offset.x = bi * batchWindows — added to local window index for red_slot.
@group(0) @binding(11) var<uniform>             batch_offset:      vec4<u32>;

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
        let count = partial_count[bid];

        // Magnitude (bid % BW) is guaranteed in [1, STRIDE] — ba_planner_classify
        // filters out zero-digit and BW-padding buckets before they reach
        // sorted_bucket_list.
        {
            // EVERY dense bucket gets is_present pre-marked, unconditional on
            // partial_count: stream_walker may have whole-retired this bucket
            // (partial_count == 0, red_buf already populated). combine_batched
            // and pt_finalize then only write coordinates, not flags.
            // Unconditional mark also keeps combine_batched within M2's 10-
            // storage cap (no is_present binding needed there).
            let red_slot = ((bid / BW) + batch_offset.x) * STRIDE + (bid % BW - 1u);
            is_present[red_slot] = 1u;

            if (count == 1u) {
                // Single partial — copy directly to red_buf.
                let M_partials = params.y;
                let slot = partial_layout[partial_offset[bid]];

                let bx = PG * red_slot;
                let px0 = partials_buf[PG * slot + 0u];
                let px1 = partials_buf[PG * slot + 1u];
                red_buf[bx + 0u] = px0;
                red_buf[bx + 1u] = px1;

                let by = PG * M_RED + PG * red_slot;
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
