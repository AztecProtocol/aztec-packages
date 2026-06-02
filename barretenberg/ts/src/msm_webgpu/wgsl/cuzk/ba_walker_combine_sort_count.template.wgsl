// Counting-sort prepass kernel A: histogram active_buckets by partial_count.
//
// Each thread = one active bucket. atomicAdd into count_histogram[n]
// where n = min(partial_count[bid], MAX_N - 1).
//
// MAX_N caps the bin range. Buckets with partial_count >= MAX_N collapse
// into the final bin (still correct, just minor tail divergence inside
// that bin). MAX_N = 64 well-exceeds empirical max (~10 at logn=17 bn254).
//
// Atomics: one per active bucket (~16K), distributed across MAX_N = 64
// counters → average ~250 writers per counter. Higher contention than
// the per-bucket atomics elsewhere, but MAX_N is tiny and the kernel is
// brief, so this is well under 0.1 ms even on mobile.

const MAX_N: u32 = 64u;
const BW: u32 = {{ bw }}u;
// Packed-window bid (SPLIT_C_PLAN.md): bid = (window << WBID_SHIFT) | mag.
const WBID_SHIFT:    u32 = 15u;
const WBID_MAG_MASK: u32 = 0x7fffu;

@group(0) @binding(0) var<storage, read>       active_buckets:   array<u32>;
@group(0) @binding(1) var<storage, read>       active_count_in:  array<u32>;
@group(0) @binding(2) var<storage, read>       partial_count:    array<u32>;
@group(0) @binding(3) var<storage, read_write> count_histogram:  array<atomic<u32>>;

// Flat CSR index (partial_count space) for a packed-window bid.
fn flat_bid(bid: u32) -> u32 {
    return (bid >> WBID_SHIFT) * BW + (bid & WBID_MAG_MASK);
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let t = gid.x;
    let NUM_ACTIVE = active_count_in[0];
    if (t >= NUM_ACTIVE) { return; }
    let bid = active_buckets[t];
    var n = partial_count[flat_bid(bid)];
    if (n >= MAX_N) { n = MAX_N - 1u; }
    atomicAdd(&count_histogram[n], 1u);

    {{{ recompile }}}
}
