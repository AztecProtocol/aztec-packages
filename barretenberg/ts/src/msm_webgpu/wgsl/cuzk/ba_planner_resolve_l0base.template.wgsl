// Stream-walker planner stage: precompute per-sorted-bucket l0 base cursor.
//
// The walker resolves a bucket's l0_index base via the dependent chain
//   sorted_bucket_list[i] -> flat_bid(.) -> offsets[.]
// at init (once per slot) AND at every bucket transition (bucket_done path).
// Each load's value is the next load's address, so the chain is unprefetchable;
// on a cold L2 it stalls, which is the walker's start-of-kernel ALU ramp, and —
// because the count-sorted stream puts the small buckets last, so the high-index
// threads transition constantly — the small-bucket end-of-kernel drain too.
//
// This kernel resolves the chain ONCE per sorted bucket into l0_base (a DEDICATED
// buffer, not an arena_a0 sub-range), which the walker then reads as a single
// coalesced, sequential, prefetchable load at both init and every transition.
//
// One thread per sorted bucket i (i < num_dense). Reads sorted_bucket_list,
// offsets (the final post-radix CSR offsets the walker reads) and window_desc;
// writes l0_base[i] = offsets[flat_bid(sorted_bucket_list[i])].
//
// batch_offset.x = bi * batchWindows (window base for flat_bid; 0 for a single MSM)

const WBID_SHIFT:    u32 = 15u;
const WBID_MAG_MASK: u32 = 0x7fffu;
const WD_STRIDE:     u32 = 8u;

@group(0) @binding(0) var<storage, read>       sorted_bucket_list: array<u32>;
@group(0) @binding(1) var<storage, read_write> l0_base:            array<u32>;
@group(0) @binding(2) var<storage, read>       offsets:            array<u32>;
@group(0) @binding(3) var<storage, read>       window_desc:        array<u32>;
@group(0) @binding(4) var<storage, read>       planner_meta:       array<u32>;
@group(0) @binding(5) var<uniform>             params:             vec4<u32>;
@group(0) @binding(6) var<uniform>             batch_offset:       vec4<u32>;

fn wd_work_off(g: u32) -> u32 { return window_desc[g * WD_STRIDE + 3u]; }

// Flat CSR index for a packed-window bid (batch-local CSR ⇒ subtract the batch
// base work_off). Byte-identical to the walker's own flat_bid.
fn flat_bid(bid: u32) -> u32 {
    let gwin = (bid >> WBID_SHIFT) + batch_offset.x;
    return wd_work_off(gwin) - wd_work_off(batch_offset.x) + (bid & WBID_MAG_MASK);
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    let num_dense = planner_meta[1];
    if (i >= num_dense) { return; }
    let bid = sorted_bucket_list[i];
    l0_base[i] = offsets[flat_bid(bid)];

    {{{ recompile }}}
}
