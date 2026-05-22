// Parallel transpose — Phase 4 of 4: scatter point indices into CSC slots.
//
// Tiled counting-sort scatter. Dispatch (num_chunks, num_windows): workgroup
// (chunk, window) re-scans its point-chunk and places each point index into
// all_csc_val_idxs. The within-chunk write cursor lives in workgroup-shared
// memory (shared atomics only — no global atomics); one chunk holds ~BW
// digits over BW buckets so contention is ~1-deep.
//
// chunk (chunk, window)'s bucket-b points are written starting at
//   all_csc_col_ptr[window*(BW+1) + b]        — global bucket start (post-scan)
//   + partials[(window*num_chunks+chunk)*BW + b]  — chunk-exclusive prefix
// and the shared cursor curr[] supplies the within-chunk slot. Each
// all_csc_val_idxs slot is written exactly once.
//
// If BW exceeds the shared cursor capacity TILE, buckets are covered in
// ceil(BW/TILE) tiles, each re-scanning the chunk.

const WG: u32 = {{ workgroup_size }}u;
const TILE: u32 = {{ tile }}u;          // shared cursor capacity (entries)

@group(0) @binding(0)
var<storage, read> all_csr_col_idx: array<u32>;

@group(0) @binding(1)
var<storage, read> all_csc_col_ptr: array<u32>;

@group(0) @binding(2)
var<storage, read> partials: array<u32>;

@group(0) @binding(3)
var<storage, read_write> all_csc_val_idxs: array<u32>;

@group(0) @binding(4)
var<uniform> params: vec4<u32>;
// params[0] = num_chunks  params[1] = BW  params[2] = n  params[3] = chunk_points

var<workgroup> curr: array<atomic<u32>, {{ tile }}>;

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(local_invocation_id) lid: vec3<u32>,
        @builtin(workgroup_id) wid: vec3<u32>) {
    let tid = lid.x;
    let chunk = wid.x;
    let window = wid.y;

    let num_chunks = params[0];
    let n_cols = params[1];
    let n = params[2];
    let chunk_points = params[3];

    let cci_offset = window * n;
    let ccp_offset = window * (n_cols + 1u);
    let part_offset = (window * num_chunks + chunk) * n_cols;
    let chunk_lo = chunk * chunk_points;
    var chunk_hi = chunk_lo + chunk_points;
    if (chunk_hi > n) { chunk_hi = n; }

    let num_tiles = (n_cols + TILE - 1u) / TILE;
    for (var t: u32 = 0u; t < num_tiles; t = t + 1u) {
        let tile_lo = t * TILE;
        let tile_hi = tile_lo + TILE;

        // Zero this tile's shared within-chunk write cursors.
        for (var s: u32 = tid; s < TILE; s = s + WG) {
            atomicStore(&curr[s], 0u);
        }
        workgroupBarrier();

        // Place every point in this chunk whose column falls in this tile.
        for (var i: u32 = chunk_lo + tid; i < chunk_hi; i = i + WG) {
            let col = all_csr_col_idx[cci_offset + i];
            if (col >= tile_lo && col < tile_hi) {
                let local_slot = atomicAdd(&curr[col - tile_lo], 1u);
                let base = all_csc_col_ptr[ccp_offset + col] + partials[part_offset + col];
                all_csc_val_idxs[cci_offset + base + local_slot] = i;
            }
        }
        workgroupBarrier();
    }

    {{{ recompile }}}
}
