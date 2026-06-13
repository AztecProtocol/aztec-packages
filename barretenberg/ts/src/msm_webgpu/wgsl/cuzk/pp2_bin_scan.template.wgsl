// pp2 preprocess K1.5 — per-window exclusive scan over the bin-count matrix.
//
// In-place over bin_counts in [window][bin][tile] order. Each window's scan
// is independent because its starting slot is known a priori: window w's
// binned entries occupy [point_offsets[w], point_offsets[w+1]) (= w·n for a
// uniform single MSM), so dispatch one workgroup per window and seed the
// running prefix with point_offsets[w] — no cross-window dependency, no
// single-workgroup serial bottleneck (which measured ~150 µs of the pp2
// phase at logn=17 on M4 before this split).
//
// After the scan, bin_counts[(w*BINS_P + bin)*num_tiles + tile] is the global
// binned-buffer slot where (tile, window, bin)'s entries start — the per-tile
// cursor K2 loads — and the [.. + 0] column is the (window, bin) segment base
// K3 reads (the next flat cell is the segment end: window w+1's first cell is
// its own base = point_offsets[w+1], and the last window writes the final
// sentinel explicitly).
//
// Three-phase chunked scan per workgroup (same shape as
// transpose_parallel_scan): per-thread chunk sums → Hillis–Steele over the
// 256 thread sums → per-chunk exclusive rewrite.

const WG: u32 = 256u;

@group(0) @binding(0) var<storage, read_write> bin_counts:    array<u32>;
@group(0) @binding(1) var<storage, read>       point_offsets: array<u32>;
// params[0] = [n (unread; debugging aid), num_tiles, tile_pts, bins_p]
// params[1] = [base_offset, scan_len (unread; debugging aid), BW, 0] (scan_len = NW*BINS_P*num_tiles)
@group(0) @binding(2) var<uniform>             params:        array<vec4<u32>, 2>;

var<workgroup> wg_sums: array<u32, WG>;

@compute
@workgroup_size(256)
fn main(@builtin(local_invocation_id) lid: vec3<u32>,
        @builtin(workgroup_id) wid: vec3<u32>,
        @builtin(num_workgroups) nwg: vec3<u32>) {
    let tid = lid.x;
    let w = wid.x;
    let num_tiles = params[0].y;
    let bins_p = params[0].w;
    let slab_len = bins_p * num_tiles;
    let slab_base = w * slab_len;
    let window_base = point_offsets[w];

    let chunk = (slab_len + WG - 1u) / WG;
    let lo = tid * chunk;
    var hi = lo + chunk;
    if (hi > slab_len) { hi = slab_len; }

    var local_sum: u32 = 0u;
    for (var i: u32 = lo; i < hi; i = i + 1u) {
        local_sum = local_sum + bin_counts[slab_base + i];
    }
    wg_sums[tid] = local_sum;
    workgroupBarrier();

    for (var stride: u32 = 1u; stride < WG; stride = stride * 2u) {
        var x = wg_sums[tid];
        if (tid >= stride) {
            x = x + wg_sums[tid - stride];
        }
        workgroupBarrier();
        wg_sums[tid] = x;
        workgroupBarrier();
    }
    let block_prefix = wg_sums[tid] - local_sum;

    // The last window's workgroup writes the flat sentinel terminating its
    // final (window, bin) segment; every other window's terminator is the
    // next window's first cell (= that window's point_offsets base).
    if (w == nwg.x - 1u && tid == WG - 1u) {
        bin_counts[slab_base + slab_len] = point_offsets[w + 1u];
    }

    var running = window_base + block_prefix;
    for (var i: u32 = lo; i < hi; i = i + 1u) {
        let t = bin_counts[slab_base + i];
        bin_counts[slab_base + i] = running;
        running = running + t;
    }

    {{{ recompile }}}
}
