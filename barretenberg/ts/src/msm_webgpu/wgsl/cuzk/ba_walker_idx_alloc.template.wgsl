// walker_index v2 — W2: fused offset-alloc + filter + count histogram.
//
// One thread per dense bucket, dispatched indirect at ceil(num_dense / TPB).
// Replaces the serial single-workgroup prefix scan, the filter pass and the
// sort_count pass of the v1 pipeline with one wide kernel:
//
//   count == 0  → mark is_present only (stream_walker whole-retired the
//                 bucket; red_buf already holds its sum).
//   count >= 1  → allocate the bucket's contiguous partial_layout region via
//                 a workgroup-aggregated bump (in-WG exclusive scan + ONE
//                 global atomicAdd per workgroup). partial_offset[fb] gets
//                 the region base; bit 31 flags count == 1 so the scatter
//                 (W3) can inline the single-partial red_buf copy.
//   count >= 2  → append (bid, n) to active_pairs via a workgroup-aggregated
//                 bump on active_meta[0], and histogram n into the shared
//                 64-bin histogram, flushed once per workgroup.
//
// Offsets are bump-allocated, NOT prefix-summed: nothing downstream relies
// on cross-bucket monotonicity — partial_offset[fb] is an opaque region base
// and per-bucket combine order is already nondeterministic. Final red_buf
// bytes are unchanged (exact abelian group arithmetic).
//
// active_meta[0] = active_count (atomic), active_meta[1] = alloc total (atomic).
// params.x = BW

const PG: u32 = 2u;
const MAX_N: u32 = 64u;
const TPB: u32 = {{ workgroup_size }}u;
const SINGLE_FLAG: u32 = 0x80000000u;
// Packed-window bid (SPLIT_C_PLAN.md): bid = (window << WBID_SHIFT) | mag.
const WBID_SHIFT:    u32 = 15u;
const WBID_MAG_MASK: u32 = 0x7fffu;

@group(0) @binding(0) var<storage, read>       sorted_bucket_list: array<u32>;
@group(0) @binding(1) var<storage, read>       partial_count:      array<u32>;
@group(0) @binding(2) var<storage, read_write> partial_offset:     array<u32>;
@group(0) @binding(3) var<storage, read_write> active_pairs:       array<u32>;
@group(0) @binding(4) var<storage, read_write> active_meta:        array<atomic<u32>>;
@group(0) @binding(5) var<storage, read_write> count_histogram:    array<atomic<u32>>;
@group(0) @binding(6) var<storage, read>       planner_meta:       array<u32>;
@group(0) @binding(7) var<storage, read_write> is_present:         array<u32>;
@group(0) @binding(8) var<storage, read>       window_desc:        array<u32>;
@group(0) @binding(9) var<uniform>             params:             vec4<u32>;
@group(0) @binding(10) var<uniform>            batch_offset:       vec4<u32>;

const WD_STRIDE: u32 = 8u;
fn wd_reduce_off(g: u32) -> u32 { return window_desc[g * WD_STRIDE + 4u]; }
fn flat_bid(bid: u32, bw: u32) -> u32 {
    return (bid >> WBID_SHIFT) * bw + (bid & WBID_MAG_MASK);
}

var<workgroup> wg_counts:     array<u32, {{ workgroup_size }}>;
var<workgroup> wg_act_bid:    array<u32, {{ workgroup_size }}>;
var<workgroup> wg_act_n:      array<u32, {{ workgroup_size }}>;
var<workgroup> wg_hist:       array<atomic<u32>, 64>;
var<workgroup> wg_active_cnt: atomic<u32>;
var<workgroup> wg_alloc_base: u32;
var<workgroup> wg_active_base: u32;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>,
        @builtin(local_invocation_id) lid: vec3<u32>) {
    let t = gid.x;
    let l = lid.x;
    let num_dense = planner_meta[1];

    if (l == 0u) { atomicStore(&wg_active_cnt, 0u); }
    if (l < MAX_N) { atomicStore(&wg_hist[l], 0u); }

    // Load this thread's bucket count (0 for over-dispatched tail threads).
    var bid: u32 = 0u;
    var fb: u32 = 0u;
    var n: u32 = 0u;
    if (t < num_dense) {
        bid = sorted_bucket_list[t];
        fb = flat_bid(bid, params.x);
        n = partial_count[fb];

        // Every dense bucket is marked present, unconditional on partial
        // count: stream_walker may have whole-retired it (count == 0, red_buf
        // already populated). combine_batched / pt_finalize then only write
        // coordinates, not flags.
        let window = bid >> WBID_SHIFT;
        let mag = bid & WBID_MAG_MASK;
        let red_slot = wd_reduce_off(window + batch_offset.x) + (mag - 1u);
        is_present[red_slot] = 1u;
    }
    wg_counts[l] = n;
    workgroupBarrier();

    // In-WG inclusive Hillis-Steele scan over counts, so the whole workgroup
    // costs ONE global atomicAdd for its layout region.
    for (var stride: u32 = 1u; stride < TPB; stride = stride * 2u) {
        var add_val: u32 = 0u;
        if (l >= stride) { add_val = wg_counts[l - stride]; }
        workgroupBarrier();
        if (l >= stride) { wg_counts[l] = wg_counts[l] + add_val; }
        workgroupBarrier();
    }
    let prefix = wg_counts[l] - n; // exclusive prefix for this thread

    if (l == 0u) {
        wg_alloc_base = atomicAdd(&active_meta[1], wg_counts[TPB - 1u]);
    }
    workgroupBarrier();

    if (n >= 1u) {
        var flag: u32 = 0u;
        if (n == 1u) { flag = SINGLE_FLAG; }
        partial_offset[fb] = (wg_alloc_base + prefix) | flag;
    }
    if (n >= 2u) {
        var nb = n;
        if (nb >= MAX_N) { nb = MAX_N - 1u; }
        let la = atomicAdd(&wg_active_cnt, 1u);
        wg_act_bid[la] = bid;
        wg_act_n[la] = nb;
        atomicAdd(&wg_hist[nb], 1u);
    }
    workgroupBarrier();

    let act = atomicLoad(&wg_active_cnt);
    if (l == 0u && act > 0u) {
        wg_active_base = atomicAdd(&active_meta[0], act);
    }
    workgroupBarrier();

    if (l < act) {
        active_pairs[2u * (wg_active_base + l) + 0u] = wg_act_bid[l];
        active_pairs[2u * (wg_active_base + l) + 1u] = wg_act_n[l];
    }
    if (l < MAX_N) {
        let h = atomicLoad(&wg_hist[l]);
        if (h > 0u) { atomicAdd(&count_histogram[l], h); }
    }

    {{{ recompile }}}
}
