// walker_index v2 — W2: fused offset-alloc + filter + count histogram.
//
// One thread per FOUR dense buckets (strided within the workgroup's
// 4*TPB-bucket block so loads coalesce), dispatched indirect at
// ceil(num_dense / (4*TPB)). Replaces the serial single-workgroup prefix
// scan, the filter pass and the sort_count pass of the v1 pipeline:
//
//   (is_present marking moved to ba_planner_classify — it is a pure
//   function of planner data; count == 0 buckets need no work here.)
//   count >= 1  → allocate the bucket's contiguous partial_layout region via
//                 a workgroup-aggregated bump: per-thread sum, ping-pong
//                 Hillis-Steele over TPB sums (ONE barrier per step), ONE
//                 global atomicAdd per workgroup. partial_offset[fb] gets
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
const ITEMS: u32 = 4u;
const BLOCK: u32 = TPB * ITEMS;
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
@group(0) @binding(7) var<uniform>             params:             vec4<u32>;

fn flat_bid(bid: u32, bw: u32) -> u32 {
    return (bid >> WBID_SHIFT) * bw + (bid & WBID_MAG_MASK);
}

// Ping-pong scan storage: [0..TPB) and [TPB..2*TPB) alternate as src/dst.
var<workgroup> scan_buf:      array<u32, {{ double_tpb }}>;
var<workgroup> wg_act_bid:    array<u32, {{ block }}>;
var<workgroup> wg_act_n:      array<u32, {{ block }}>;
var<workgroup> wg_hist:       array<atomic<u32>, 64>;
var<workgroup> wg_active_cnt: atomic<u32>;
var<workgroup> wg_alloc_base: u32;
var<workgroup> wg_active_base: u32;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(workgroup_id) wid: vec3<u32>,
        @builtin(local_invocation_id) lid: vec3<u32>) {
    let l = lid.x;
    let block_base = wid.x * BLOCK;
    let num_dense = planner_meta[1];

    if (l == 0u) { atomicStore(&wg_active_cnt, 0u); }
    if (l < MAX_N) { atomicStore(&wg_hist[l], 0u); }

    // Load this thread's ITEMS buckets (strided by TPB → coalesced rounds)
    // and accumulate the thread's partial-count sum.
    var bids:   array<u32, 4>;
    var fbs:    array<u32, 4>;
    var counts: array<u32, 4>;
    var thread_sum: u32 = 0u;
    for (var j: u32 = 0u; j < ITEMS; j = j + 1u) {
        let t = block_base + j * TPB + l;
        var n: u32 = 0u;
        if (t < num_dense) {
            let bid = sorted_bucket_list[t];
            let fb = flat_bid(bid, params.x);
            n = partial_count[fb];
            bids[j] = bid;
            fbs[j] = fb;
        }
        counts[j] = n;
        thread_sum = thread_sum + n;
    }
    scan_buf[l] = thread_sum;
    workgroupBarrier();

    // Inclusive Hillis-Steele over the TPB thread sums, ping-pong halves —
    // ONE barrier per step (8 steps at TPB=256).
    var base: u32 = 0u;
    for (var stride: u32 = 1u; stride < TPB; stride = stride * 2u) {
        let nb = TPB - base;
        var v = scan_buf[base + l];
        if (l >= stride) { v = v + scan_buf[base + l - stride]; }
        scan_buf[nb + l] = v;
        base = nb;
        workgroupBarrier();
    }
    let thread_excl = scan_buf[base + l] - thread_sum;

    if (l == 0u) {
        wg_alloc_base = atomicAdd(&active_meta[1], scan_buf[base + TPB - 1u]);
    }
    workgroupBarrier();

    // Assign offsets element-by-element in this thread's local order, stash
    // actives in shared memory, build the shared histogram.
    var running = wg_alloc_base + thread_excl;
    for (var j: u32 = 0u; j < ITEMS; j = j + 1u) {
        let n = counts[j];
        if (n >= 1u) {
            var flag: u32 = 0u;
            if (n == 1u) { flag = SINGLE_FLAG; }
            partial_offset[fbs[j]] = running | flag;
            running = running + n;
        }
        if (n >= 2u) {
            var nb = n;
            if (nb >= MAX_N) { nb = MAX_N - 1u; }
            let la = atomicAdd(&wg_active_cnt, 1u);
            wg_act_bid[la] = bids[j];
            wg_act_n[la] = nb;
            atomicAdd(&wg_hist[nb], 1u);
        }
    }
    workgroupBarrier();

    let act = atomicLoad(&wg_active_cnt);
    if (l == 0u && act > 0u) {
        wg_active_base = atomicAdd(&active_meta[0], act);
    }
    workgroupBarrier();

    for (var j: u32 = 0u; j < ITEMS; j = j + 1u) {
        let idx = j * TPB + l;
        if (idx < act) {
            active_pairs[2u * (wg_active_base + idx) + 0u] = wg_act_bid[idx];
            active_pairs[2u * (wg_active_base + idx) + 1u] = wg_act_n[idx];
        }
    }
    if (l < MAX_N) {
        let h = atomicLoad(&wg_hist[l]);
        if (h > 0u) { atomicAdd(&count_histogram[l], h); }
    }

    {{{ recompile }}}
}
