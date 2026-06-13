// walker_index v2 — W1: count partials per bucket.
//
// One thread per partial slot, dispatched indirect at exactly
// ceil(M_actual / TPB) workgroups where M_actual = 2 * S * num_active_threads
// (the walker's true emission range, recomputed here from planner_meta[3]).
// The walker initialises every slot in that range (NO_BUCKET or a real bid),
// so no host-side clear of partial_dest is needed on this path and no thread
// reads beyond the initialised range.
//
// params.x = BW (flat CSR width per window)

const NO_BUCKET: u32 = 0xffffffffu;
// Packed-window bid (SPLIT_C_PLAN.md): bid = (window << WBID_SHIFT) | mag.
const WBID_SHIFT:    u32 = 15u;
const WBID_MAG_MASK: u32 = 0x7fffu;
const THREAD_TPB: u32 = {{ thread_tpb }}u;
const S: u32 = {{ s }}u;

@group(0) @binding(0) var<storage, read>       partial_dest:  array<u32>;
@group(0) @binding(1) var<storage, read_write> partial_count: array<atomic<u32>>;
@group(0) @binding(2) var<storage, read>       planner_meta:  array<u32>;
@group(0) @binding(3) var<uniform>             params:        vec4<u32>;

fn flat_bid(bid: u32, bw: u32) -> u32 {
    return (bid >> WBID_SHIFT) * bw + (bid & WBID_MAG_MASK);
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let slot = gid.x;
    let m_actual = 2u * S * planner_meta[3] * THREAD_TPB;
    if (slot >= m_actual) { return; }
    let bid = partial_dest[slot];
    // bid == 0 can never be a real walker output (classify drops magnitude-0
    // buckets) — kept as defence alongside the NO_BUCKET sentinel.
    if (bid == 0u || bid == NO_BUCKET) { return; }
    atomicAdd(&partial_count[flat_bid(bid, params.x)], 1u);

    {{{ recompile }}}
}
