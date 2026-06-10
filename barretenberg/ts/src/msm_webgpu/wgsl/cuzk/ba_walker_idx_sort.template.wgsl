// walker_index v2 — W5: counting-sort scatter of active buckets by partial
// count, with workgroup-aggregated bin cursors.
//
// One thread per active bucket, dispatched indirect at exactly
// ceil(active_count / TPB) (args from the epilogue). Reads the (bid, n)
// pair written by W2 — one coalesced load, no scattered partial_count
// gather. Per-bin ranks are taken on shared counters; each workgroup then
// claims one global region per occupied bin (≤ 64 global atomics per WG,
// instead of one per bucket — Mali serialises global atomics aggressively).
//
// Output layout matches v1: sorted_active_buckets[bin_offsets[n] + i] holds
// pure bids, bins in ascending n. In-bin order is nondeterministic (v1's
// raw per-thread atomics were too).

const MAX_N: u32 = 64u;
const TPB: u32 = {{ workgroup_size }}u;

@group(0) @binding(0) var<storage, read>       active_pairs:          array<u32>;
@group(0) @binding(1) var<storage, read>       active_meta:           array<u32>;
@group(0) @binding(2) var<storage, read>       bin_offsets:           array<u32>;
@group(0) @binding(3) var<storage, read_write> bin_write_pos:         array<atomic<u32>>;
@group(0) @binding(4) var<storage, read_write> sorted_active_buckets: array<u32>;

var<workgroup> wg_bin_count: array<atomic<u32>, 64>;
var<workgroup> wg_bin_base:  array<u32, 64>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>,
        @builtin(local_invocation_id) lid: vec3<u32>) {
    let t = gid.x;
    let l = lid.x;
    let n_active = active_meta[0];

    if (l < MAX_N) { atomicStore(&wg_bin_count[l], 0u); }
    workgroupBarrier();

    var bid: u32 = 0u;
    var n: u32 = 0u;
    var rank: u32 = 0u;
    let live = t < n_active;
    if (live) {
        bid = active_pairs[2u * t + 0u];
        n = active_pairs[2u * t + 1u]; // already capped at MAX_N-1 by W2
        rank = atomicAdd(&wg_bin_count[n], 1u);
    }
    workgroupBarrier();

    if (l < MAX_N) {
        let c = atomicLoad(&wg_bin_count[l]);
        if (c > 0u) { wg_bin_base[l] = atomicAdd(&bin_write_pos[l], c); }
    }
    workgroupBarrier();

    if (live) {
        sorted_active_buckets[bin_offsets[n] + wg_bin_base[n] + rank] = bid;
    }

    {{{ recompile }}}
}
