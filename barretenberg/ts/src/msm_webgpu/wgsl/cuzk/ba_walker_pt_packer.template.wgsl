// Persistent kernel preprocessor — assigns hot buckets to workgroups via
// LPT (Largest Processing Time first) bin packing so every WG gets
// approximately equal work.
//
// Per-bucket work ∝ N (the bucket's partial count). LPT: walk buckets in
// descending order, assign each to the lightest WG so far. Max-load WG ≤
// min-load WG + max_bucket_N → near-optimal balance.
//
// Output:
//   pt_bucket_wg[i]           = wg ID assigned to bucket at sorted-hot index i
//   pt_wg_bucket_starts[g]    = exclusive prefix-sum start of WG g's slot in
//                               pt_wg_bucket_list (final length pt_wg_bucket_starts[NUM_WGS] = NUM_HOT)
//   pt_wg_bucket_list[slot]   = bid of buckets in packed-by-WG order
//   pt_wg_meta[g*4 + 0]       = scratch offset for WG g in pt_buf (= 2 × cumulative partials of prior WGs)
//   pt_wg_meta[g*4 + 1]       = bucket count for WG g
//   pt_wg_meta[g*4 + 2]       = total partials sum for WG g
//   pt_persistent_args        = (NUM_WGS, 1, 1)
//   pt_dispatch_args          = (0, 0, 0) — multi-dispatch no-op

const MAX_N: u32 = 64u;
const HOT_THRESHOLD: u32 = 8u;
const PER_WG_MAX_PARTIALS: u32 = {{ per_wg_max_partials }}u;
const MAX_WGS: u32 = {{ max_wgs }}u;
const MIN_WGS: u32 = {{ min_wgs }}u;

@group(0) @binding(0) var<storage, read>       sorted_active:        array<u32>;
@group(0) @binding(1) var<storage, read>       bin_offsets:          array<u32>;
@group(0) @binding(2) var<storage, read>       active_count:         array<u32>;
@group(0) @binding(3) var<storage, read>       partial_count:        array<u32>;
@group(0) @binding(4) var<storage, read_write> pt_bucket_wg:         array<u32>;
@group(0) @binding(5) var<storage, read_write> pt_wg_meta:           array<u32>;
@group(0) @binding(6) var<storage, read_write> pt_wg_bucket_list:    array<u32>;
@group(0) @binding(7) var<storage, read_write> pt_wg_bucket_starts:  array<u32>;
@group(0) @binding(8) var<storage, read_write> pt_persistent_args:   array<u32>;
@group(0) @binding(9) var<storage, read_write> pt_dispatch_args:     array<u32>;

@compute @workgroup_size(1)
fn main() {
    let cool_end = bin_offsets[HOT_THRESHOLD + 1u];
    let NUM_ACTIVE = active_count[0];
    let NUM_HOT = NUM_ACTIVE - cool_end;

    if (NUM_HOT == 0u) {
        pt_persistent_args[0] = 0u;
        pt_persistent_args[1] = 1u;
        pt_persistent_args[2] = 1u;
        pt_dispatch_args[0] = 0u;
        pt_dispatch_args[1] = 1u;
        pt_dispatch_args[2] = 1u;
        return;
    }

    // Total hot partials: iterate sorted_active over hot range, sum.
    // Approximate via histogram would be faster but inexact for clamped bin.
    var total_hot: u32 = 0u;
    for (var i: u32 = 0u; i < NUM_HOT; i = i + 1u) {
        let bid = sorted_active[cool_end + i];
        total_hot = total_hot + partial_count[bid];
    }

    var num_wgs: u32 = (total_hot + PER_WG_MAX_PARTIALS - 1u) / PER_WG_MAX_PARTIALS;
    if (num_wgs < MIN_WGS) { num_wgs = MIN_WGS; }
    if (num_wgs > MAX_WGS) { num_wgs = MAX_WGS; }
    if (num_wgs > NUM_HOT) { num_wgs = NUM_HOT; }

    var wg_load:  array<u32, {{ max_wgs }}>;
    var wg_count: array<u32, {{ max_wgs }}>;
    for (var g: u32 = 0u; g < num_wgs; g = g + 1u) {
        wg_load[g] = 0u;
        wg_count[g] = 0u;
    }

    // === Pass 1: LPT — sorted_active is ascending by N; walk DESCENDING.
    var i: u32 = NUM_HOT;
    while (i > 0u) {
        i = i - 1u;
        let bid = sorted_active[cool_end + i];
        let N = partial_count[bid];
        // Find lightest WG.
        var min_g: u32 = 0u;
        var min_load: u32 = wg_load[0];
        for (var g: u32 = 1u; g < num_wgs; g = g + 1u) {
            if (wg_load[g] < min_load) {
                min_load = wg_load[g];
                min_g = g;
            }
        }
        wg_load[min_g] = wg_load[min_g] + N;
        wg_count[min_g] = wg_count[min_g] + 1u;
        pt_bucket_wg[i] = min_g;
    }

    // === Pass 2: pt_wg_bucket_starts = exclusive prefix sum of wg_count.
    var running: u32 = 0u;
    for (var g: u32 = 0u; g < num_wgs; g = g + 1u) {
        pt_wg_bucket_starts[g] = running;
        running = running + wg_count[g];
    }
    pt_wg_bucket_starts[num_wgs] = running;

    // === Pass 3: scatter bids to packed positions.
    var wg_so_far: array<u32, {{ max_wgs }}>;
    for (var g: u32 = 0u; g < num_wgs; g = g + 1u) { wg_so_far[g] = 0u; }
    for (var ii: u32 = 0u; ii < NUM_HOT; ii = ii + 1u) {
        let g = pt_bucket_wg[ii];
        let bid = sorted_active[cool_end + ii];
        let slot = pt_wg_bucket_starts[g] + wg_so_far[g];
        pt_wg_bucket_list[slot] = bid;
        wg_so_far[g] = wg_so_far[g] + 1u;
    }

    // === Pass 4: per-WG metadata. Each bucket needs N + ceil(N/2) + ... + 1
    // slots for shift-layout pair-tree (up to 2N + log₂(N) for odd N). To
    // give the persistent kernel safe per-bucket reserves we conservatively
    // use 2*N + 32 per bucket — fits any pathological N up to 2^32.
    var scratch_off: u32 = 0u;
    for (var g: u32 = 0u; g < num_wgs; g = g + 1u) {
        pt_wg_meta[g * 4u + 0u] = scratch_off;
        pt_wg_meta[g * 4u + 1u] = wg_count[g];
        pt_wg_meta[g * 4u + 2u] = wg_load[g];
        pt_wg_meta[g * 4u + 3u] = 0u;
        scratch_off = scratch_off + 2u * wg_load[g] + 32u * wg_count[g];
    }

    pt_persistent_args[0] = num_wgs;
    pt_persistent_args[1] = 1u;
    pt_persistent_args[2] = 1u;
    pt_dispatch_args[0] = 0u;
    pt_dispatch_args[1] = 1u;
    pt_dispatch_args[2] = 1u;

    {{{ recompile }}}
}
