// Pair-tree v2: initial slice-base scan.
//
// Computes per-hot-bucket slice_base in pt_buf via exclusive prefix sum
// over 2 * partial_count[bid]. The 2× factor reserves space for the
// per-level shift layout: bucket B's level-k partials live at
//   slice_base[hot_idx] + sum_{j<k}(level_count_j)
// inside its 2*N reserved slice. Total slot usage = 2 * sum(N over hot)
// ≤ 2 * total_partials ≤ 2 * M_partials_walker = M_pt.
//
// Also seeds pt_off[hot_idx] = slice_base, pt_count[hot_idx] = N (the
// level-0 state). The pair-tree driver loop calls pt_build/pt_combine
// against (pt_off, pt_count) and advances them in place each level.
//
// Single-thread kernel. NUM_HOT ≤ ~34K in extreme clustered profiles;
// even at 34K iters × ~6 ns/iter ≈ 0.2 ms. Acceptable for v1; later we
// can swap for a workgroup-shared multi-thread scan if it shows up in
// the breakdown.

const HOT_THRESHOLD: u32 = 8u;

@group(0) @binding(0) var<storage, read>       sorted_active:  array<u32>;
@group(0) @binding(1) var<storage, read>       bin_offsets:    array<u32>;
@group(0) @binding(2) var<storage, read>       active_count:   array<u32>;
@group(0) @binding(3) var<storage, read>       partial_count:  array<u32>;
@group(0) @binding(4) var<storage, read_write> pt_off:         array<u32>;
@group(0) @binding(5) var<storage, read_write> pt_count:       array<u32>;
@group(0) @binding(6) var<storage, read_write> pt_meta:        array<u32>;
//   pt_meta[0] = NUM_HOT   (= active_count - bin_offsets[HOT_THRESHOLD+1])
//   pt_meta[1] = total_level_partials  (= sum of pt_count[] at current level)

@compute @workgroup_size(1)
fn main() {
    let cool_end = bin_offsets[HOT_THRESHOLD + 1u];
    let NUM_ACTIVE = active_count[0];
    let NUM_HOT = NUM_ACTIVE - cool_end;

    var running: u32 = 0u;
    var total_orig: u32 = 0u;
    for (var hot_idx: u32 = 0u; hot_idx < NUM_HOT; hot_idx = hot_idx + 1u) {
        let bid = sorted_active[cool_end + hot_idx];
        let cnt = partial_count[bid];
        pt_off[hot_idx] = running;
        pt_count[hot_idx] = cnt;
        total_orig = total_orig + cnt;
        // Simulate level reductions to get the EXACT slot count this bucket
        // needs. 2*N is an under-estimate for odd N (each odd level's
        // copy-survivor adds 1 above the geometric series).
        var n: u32 = cnt;
        var slots: u32 = 0u;
        loop {
            slots = slots + n;
            if (n <= 1u) { break; }
            n = (n + 1u) / 2u;
        }
        running = running + slots;
    }
    pt_meta[0] = NUM_HOT;
    pt_meta[1] = total_orig;

    {{{ recompile }}}
}
