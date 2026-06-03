// Parallel transpose — Phase 1 of 4: per-point-tile bucket histogram.
//
// Tiled counting-sort count. Dispatch (num_point_tiles, num_windows):
// workgroup (point_tile, window) histograms its tile's column indices into
// a workgroup-shared histogram and writes the tile's partial-histogram row
// to `partials`. Parallelizing across point-tiles (not just windows) keeps
// the GPU saturated so DRAM latency is hidden; with one tile holding
// ~BW digits over BW buckets the shared-atomic contention is ~1-deep. No
// global atomics are used — only on-chip shared atomics.
//
// partials layout: [window][point_tile][bucket], row stride num_point_tiles*BW;
//   partials[(window*num_point_tiles + point_tile)*BW + bucket] = count of
//   `bucket` among this window's points in this tile.
//
// If BW exceeds the shared histogram capacity TILE, buckets are covered in
// ceil(BW/TILE) sub-tiles, each re-scanning the (coalesced) point tile.

const WG: u32 = {{ workgroup_size }}u;
const TILE: u32 = {{ tile }}u;          // shared histogram capacity (entries)
const WD_STRIDE: u32 = 8u;

// One u32 per (window, point): low 31 bits = bucket index (Booth digit),
// bit 31 = sign. We mask off the sign bit when using the entry as a CSR
// column index. See decompose_scalars_booth header for the packing rationale.
@group(0) @binding(0)
var<storage, read> bucket_and_sign: array<u32>;

@group(0) @binding(1)
var<storage, read_write> partials: array<u32>;

@group(0) @binding(2)
var<uniform> params: vec4<u32>;
// params[0] = num_point_tiles  params[1] = cci_base (bucket_and_sign region base;
// 0 for the lower/no-split region, W_lo*n for the split-c upper region)
// params[2] = n (per-region input_size: n lower, n_large upper)  params[3] = points_per_tile

// WindowDesc (SPLIT_C_PLAN.md): per-GLOBAL-window geometry, stride 8 u32.
// num_columns at +5 (CSR column count), work_off at +3 (prefix of num_columns).
@group(0) @binding(3)
var<storage, read> window_desc: array<u32>;
// batch_window_base.x = global index of this batch's first window (Lever G).
@group(0) @binding(4)
var<uniform> batch_window_base: vec4<u32>;

var<workgroup> hist: array<atomic<u32>, {{ tile }}>;

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(local_invocation_id) lid: vec3<u32>,
        @builtin(workgroup_id) wid: vec3<u32>) {
    let tid = lid.x;
    let point_tile = wid.x;
    let window = wid.y;

    let num_point_tiles = params[0];
    let n = params[2];
    let points_per_tile = params[3];

    // Per-window CSR geometry from WindowDesc (global window = batch-local +
    // batch base). work_off is a global prefix; subtract the batch's base so
    // the partials layout stays batch-local. Uniform fill ⇒ n_cols == BW and
    // work_off_local == window * BW (byte-identical to the old constant path).
    let gwin = window + batch_window_base.x;
    let n_cols = window_desc[gwin * WD_STRIDE + 5u];
    let work_off_local = window_desc[gwin * WD_STRIDE + 3u]
                       - window_desc[batch_window_base.x * WD_STRIDE + 3u];

    let cci_offset = params[1] + window * n; // params[1] = region base (0 lower)
    let part_offset = num_point_tiles * work_off_local + point_tile * n_cols;
    let tile_point_lo = point_tile * points_per_tile;
    var tile_point_hi = tile_point_lo + points_per_tile;
    if (tile_point_hi > n) { tile_point_hi = n; }

    // Sub-tile loop: shared histogram has fixed capacity TILE entries, so if
    // the bucket count BW exceeds TILE, cover BW in ceil(BW/TILE) sub-tiles,
    // re-scanning the point tile per sub-tile. Naming: `bucket_subtile_*` is
    // a window of bucket indices [bucket_subtile_lo, bucket_subtile_hi) that
    // fits in the shared hist.
    let num_bucket_subtiles = (n_cols + TILE - 1u) / TILE;
    for (var t: u32 = 0u; t < num_bucket_subtiles; t = t + 1u) {
        let bucket_subtile_lo = t * TILE;
        let bucket_subtile_hi = bucket_subtile_lo + TILE;

        // Zero this sub-tile's shared histogram.
        for (var s: u32 = tid; s < TILE; s = s + WG) {
            atomicStore(&hist[s], 0u);
        }
        workgroupBarrier();

        // Tally every column index in this point tile that falls in this
        // bucket sub-tile. Mask off bit 31 (sign) — only the bucket index
        // matters here.
        for (var i: u32 = tile_point_lo + tid; i < tile_point_hi; i = i + WG) {
            let col = bucket_and_sign[cci_offset + i] & 0x7FFFFFFFu;
            if (col >= bucket_subtile_lo && col < bucket_subtile_hi) {
                atomicAdd(&hist[col - bucket_subtile_lo], 1u);
            }
        }
        workgroupBarrier();

        // Store this sub-tile's counts to the point tile's partial row (one
        // writer per cell — plain store, no atomic).
        for (var s: u32 = tid; s < TILE; s = s + WG) {
            let col = bucket_subtile_lo + s;
            if (col < n_cols) {
                partials[part_offset + col] = atomicLoad(&hist[s]);
            }
        }
        workgroupBarrier();
    }

    {{{ recompile }}}
}
