// pp2 preprocess K1.5 — flat exclusive scan over the bin-count matrix.
//
// In-place over bin_counts in [window][bin][tile] order (scan_len = NW *
// BINS_P * num_tiles entries), plus the total sentinel written at
// bin_counts[scan_len]. After the scan, bin_counts[(w*BINS_P + bin)*num_tiles
// + tile] is the global binned-buffer slot where (tile, window, bin)'s
// entries start — the per-tile cursor K2 loads — and the [.. + 0] column
// doubles as the (window, bin) segment base K3 reads (the next flat cell is
// the segment end, with the sentinel covering the very last segment). Σ over
// a window's bins+tiles is exactly that window's point count, so the
// window-major segment bases come out of the single flat scan with no extra
// bookkeeping.
//
// One workgroup, three-phase chunked scan (same shape as
// transpose_parallel_scan): per-thread chunk sums → Hillis–Steele over the
// 256 thread sums → per-chunk exclusive rewrite. The matrix is ~0.2-1.3 MB,
// so single-workgroup occupancy is irrelevant next to the K2/K3 streams.

const WG: u32 = 256u;

@group(0) @binding(0) var<storage, read_write> bin_counts: array<u32>;
// params[0] = [n, num_tiles, tile_pts, bins_p] (unused here)
// params[1] = [base_offset, scan_len, BW, 0]
@group(0) @binding(1) var<uniform>             params:     array<vec4<u32>, 2>;

var<workgroup> wg_sums: array<u32, WG>;

@compute
@workgroup_size(256)
fn main(@builtin(local_invocation_id) lid: vec3<u32>) {
    let tid = lid.x;
    let len = params[1].y;
    let chunk = (len + WG - 1u) / WG;
    let lo = tid * chunk;
    var hi = lo + chunk;
    if (hi > len) { hi = len; }

    var local_sum: u32 = 0u;
    for (var i: u32 = lo; i < hi; i = i + 1u) {
        local_sum = local_sum + bin_counts[i];
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
    // Thread WG-1 holds the grand total after the scan — the sentinel that
    // terminates the last (window, bin) segment for K3.
    if (tid == WG - 1u) {
        bin_counts[len] = wg_sums[WG - 1u];
    }

    var running = block_prefix;
    for (var i: u32 = lo; i < hi; i = i + 1u) {
        let t = bin_counts[i];
        bin_counts[i] = running;
        running = running + t;
    }

    {{{ recompile }}}
}
