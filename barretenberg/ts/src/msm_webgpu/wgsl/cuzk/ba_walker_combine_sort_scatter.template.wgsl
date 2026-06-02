// Counting-sort prepass kernel C: scatter active_buckets into
// sorted_active_buckets, ordered by partial_count.
//
// Each thread = one active bucket. atomicAdd on bin_write_pos[n] gives
// local position within bin n; final slot = bin_offsets[n] + local.
// Output layout: [N=0 buckets][N=1 buckets][N=2 buckets]...[N=MAX_N-1].
// (N=0/N=1 bins are empty in practice — filter excluded count<2 buckets.)
//
// After this, combine_batched reads sorted_active_buckets so each
// thread's S=8 slots fall (almost) entirely within one bin → zero
// tail divergence for in-bin threads.

const MAX_N: u32 = 64u;
const BW: u32 = {{ bw }}u;
// Packed-window bid (SPLIT_C_PLAN.md): bid = (window << WBID_SHIFT) | mag.
const WBID_SHIFT:    u32 = 15u;
const WBID_MAG_MASK: u32 = 0x7fffu;

@group(0) @binding(0) var<storage, read>       active_buckets:        array<u32>;
@group(0) @binding(1) var<storage, read>       active_count_in:       array<u32>;
@group(0) @binding(2) var<storage, read>       partial_count:         array<u32>;
@group(0) @binding(3) var<storage, read>       bin_offsets:           array<u32>;
@group(0) @binding(4) var<storage, read_write> bin_write_pos:         array<atomic<u32>>;
@group(0) @binding(5) var<storage, read_write> sorted_active_buckets: array<u32>;

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
    let local = atomicAdd(&bin_write_pos[n], 1u);
    sorted_active_buckets[bin_offsets[n] + local] = bid;

    {{{ recompile }}}
}
