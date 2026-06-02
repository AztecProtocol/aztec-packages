// Pair-tree v2: parallel level-0 partial copy.
//
// One thread per hot bucket. Reads pt_off (slice_base, computed by
// pt_init_scan) and copies the bucket's N original partials from
// partials_buf (indexed via partial_layout) into pt_buf at
// pt_off..pt_off+N.
//
// Plane-separated layout: pt_buf[PG*idx + (0,1)] is X, pt_buf[PG*M_pt +
// PG*idx + (0,1)] is Y. partials_buf has the same shape with stride
// M_partials.

const HOT_THRESHOLD: u32 = 8u;
const PG: u32 = 2u;
const BW: u32 = {{ bw }}u;
// Packed-window bid (SPLIT_C_PLAN.md): bid = (window << WBID_SHIFT) | mag.
const WBID_SHIFT:    u32 = 15u;
const WBID_MAG_MASK: u32 = 0x7fffu;

// Flat CSR index (partial_* space) for a packed-window bid.
fn flat_bid(bid: u32) -> u32 {
    return (bid >> WBID_SHIFT) * BW + (bid & WBID_MAG_MASK);
}

@group(0) @binding(0) var<storage, read>       sorted_active:  array<u32>;
@group(0) @binding(1) var<storage, read>       bin_offsets:    array<u32>;
@group(0) @binding(2) var<storage, read>       active_count:   array<u32>;
@group(0) @binding(3) var<storage, read>       partial_count:  array<u32>;
@group(0) @binding(4) var<storage, read>       partial_offset: array<u32>;
@group(0) @binding(5) var<storage, read>       partial_layout: array<u32>;
@group(0) @binding(6) var<storage, read>       partials_buf:   array<vec4<u32>>;
@group(0) @binding(7) var<storage, read>       pt_off:         array<u32>;
@group(0) @binding(8) var<storage, read_write> pt_buf:         array<vec4<u32>>;
@group(0) @binding(9) var<uniform>             params:         vec4<u32>;
//   params.x = M_partials (partials_buf plane stride)
//   params.y = M_pt       (pt_buf plane stride)

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let hot_idx = gid.x;
    let cool_end = bin_offsets[HOT_THRESHOLD + 1u];
    let NUM_ACTIVE = active_count[0];
    if (cool_end + hot_idx >= NUM_ACTIVE) { return; }

    let bid = sorted_active[cool_end + hot_idx];
    let fb = flat_bid(bid);
    let N = partial_count[fb];
    let p_off = partial_offset[fb];
    let pt_base = pt_off[hot_idx];
    let M_partials = params.x;
    let M_pt = params.y;

    // Defensive cap. N = partial_count[bid] is bounded by total partial
    // slots across all batches (~786K worst case). 1M is a safety ceiling
    // that completes within ~10ms per thread even in pathological cases.
    for (var i: u32 = 0u; i < N; i = i + 1u) {
        if (i >= 1048576u) { break; }
        let slot = partial_layout[p_off + i];
        let x0 = partials_buf[PG * slot + 0u];
        let x1 = partials_buf[PG * slot + 1u];
        let y0 = partials_buf[PG * M_partials + PG * slot + 0u];
        let y1 = partials_buf[PG * M_partials + PG * slot + 1u];
        pt_buf[PG * (pt_base + i) + 0u] = x0;
        pt_buf[PG * (pt_base + i) + 1u] = x1;
        pt_buf[PG * M_pt + PG * (pt_base + i) + 0u] = y0;
        pt_buf[PG * M_pt + PG * (pt_base + i) + 1u] = y1;
    }

    {{{ recompile }}}
}
