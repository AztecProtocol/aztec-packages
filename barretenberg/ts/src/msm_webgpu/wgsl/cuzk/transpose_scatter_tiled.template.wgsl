// Parallel transpose — Phase 4 of 4: scatter point indices into CSC slots.
//
// Tiled counting-sort scatter. Dispatch (num_point_tiles, num_windows):
// workgroup (point_tile, window) re-scans its point tile and places each
// point index into all_csc_val_idxs. The within-tile write cursor lives in
// workgroup-shared memory (shared atomics only — no global atomics); one
// tile holds ~BW digits over BW buckets so contention is ~1-deep.
//
// Tile (point_tile, window)'s bucket-b points are written starting at
//   all_csc_col_ptr[window*(BW+1) + b]                — global bucket start
//   + partials[(window*num_point_tiles+point_tile)*BW + b]  — tile-excl prefix
// and the shared cursor curr[] supplies the within-tile slot. Each
// all_csc_val_idxs slot is written exactly once.
//
// If BW exceeds the shared cursor capacity TILE, buckets are covered in
// ceil(BW/TILE) sub-tiles, each re-scanning the point tile.

const WG: u32 = {{ workgroup_size }}u;
const TILE: u32 = {{ tile }}u;          // shared cursor capacity (entries)
const WD_STRIDE: u32 = 8u;

// One u32 per (window, point): low 31 bits = bucket index, bit 31 = sign.
// We mask off the sign bit when scattering by bucket. See
// decompose_scalars_booth header for the packing rationale.
@group(0) @binding(0)
var<storage, read> bucket_and_sign: array<u32>;

@group(0) @binding(1)
var<storage, read> all_csc_col_ptr: array<u32>;

@group(0) @binding(2)
var<storage, read> partials: array<u32>;

@group(0) @binding(3)
var<storage, read_write> all_csc_val_idxs: array<u32>;

@group(0) @binding(4)
var<uniform> params: vec4<u32>;
// params[0] = num_point_tiles  params[1] = input_size (points to iterate: n
// lower/no-split, n_large upper)  params[2] = row_stride (val_idx/bucket window
// stride, always n)  params[3] = points_per_tile

// WindowDesc (SPLIT_C_PLAN.md): num_columns at +5, work_off (prefix) at +3.
@group(0) @binding(5)
var<storage, read> window_desc: array<u32>;
// batch_window_base.x = global index of this batch's first window.
@group(0) @binding(6)
var<uniform> batch_window_base: vec4<u32>;

var<workgroup> curr: array<atomic<u32>, {{ tile }}>;

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(local_invocation_id) lid: vec3<u32>,
        @builtin(workgroup_id) wid: vec3<u32>) {
    let tid = lid.x;
    let point_tile = wid.x;
    let window = wid.y;

    let num_point_tiles = params[0];
    let input_size = params[1]; // points to iterate (n lower, n_large upper)
    let row_stride = params[2]; // val_idx/bucket window stride (always n)
    let points_per_tile = params[3];

    // Per-window CSR geometry from WindowDesc (batch-local work_off = global
    // prefix minus batch base). Uniform fill ⇒ identical to the old path.
    let gwin = window + batch_window_base.x;
    let n_cols = window_desc[gwin * WD_STRIDE + 5u];
    let work_off_local = window_desc[gwin * WD_STRIDE + 3u]
                       - window_desc[batch_window_base.x * WD_STRIDE + 3u];

    let cci_offset = window * row_stride; // val_idx/bucket[window*n + point]
    let ccp_offset = work_off_local + window;
    let part_offset = num_point_tiles * work_off_local + point_tile * n_cols;
    let tile_point_lo = point_tile * points_per_tile;
    var tile_point_hi = tile_point_lo + points_per_tile;
    if (tile_point_hi > input_size) { tile_point_hi = input_size; }

    // Sub-tile loop over buckets: shared `curr` cursor has fixed capacity
    // TILE entries, so for large BW we cover BW in ceil(BW/TILE) sub-tiles,
    // re-scanning the point tile per sub-tile.
    let num_bucket_subtiles = (n_cols + TILE - 1u) / TILE;
    for (var t: u32 = 0u; t < num_bucket_subtiles; t = t + 1u) {
        let bucket_subtile_lo = t * TILE;
        let bucket_subtile_hi = bucket_subtile_lo + TILE;

        // Zero this sub-tile's shared within-tile write cursors.
        for (var s: u32 = tid; s < TILE; s = s + WG) {
            atomicStore(&curr[s], 0u);
        }
        workgroupBarrier();

        // Place every point in this point tile whose column falls in this
        // bucket sub-tile. Mask off bit 31 (sign) — only the bucket index
        // addresses the CSC.
        for (var i: u32 = tile_point_lo + tid; i < tile_point_hi; i = i + WG) {
            let col = bucket_and_sign[cci_offset + i] & 0x7FFFFFFFu;
            if (col >= bucket_subtile_lo && col < bucket_subtile_hi) {
                let local_slot = atomicAdd(&curr[col - bucket_subtile_lo], 1u);
                let base = all_csc_col_ptr[ccp_offset + col] + partials[part_offset + col];
                all_csc_val_idxs[cci_offset + base + local_slot] = i;
            }
        }
        workgroupBarrier();
    }

    {{{ recompile }}}
}
