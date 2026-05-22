// Parallel transpose — Phase 1 of 4: per-chunk bucket histogram.
//
// Tiled counting-sort count. Dispatch (num_chunks, num_windows): workgroup
// (chunk, window) histograms its point-chunk's column indices into a
// workgroup-shared histogram and writes the chunk's partial-histogram row
// to `partials`. Parallelizing across point-chunks (not just windows) keeps
// the GPU saturated so DRAM latency is hidden; with one chunk holding
// ~BW digits over BW buckets the shared-atomic contention is ~1-deep. No
// global atomics are used — only on-chip shared atomics.
//
// partials layout: [window][chunk][bucket], row stride num_chunks*BW;
//   partials[(window*num_chunks + chunk)*BW + bucket] = count of `bucket`
//   among this window's points in this chunk.
//
// If BW exceeds the shared histogram capacity TILE, buckets are covered in
// ceil(BW/TILE) tiles, each re-scanning the (coalesced) chunk.

const WG: u32 = {{ workgroup_size }}u;
const TILE: u32 = {{ tile }}u;          // shared histogram capacity (entries)

@group(0) @binding(0)
var<storage, read> all_csr_col_idx: array<u32>;

@group(0) @binding(1)
var<storage, read_write> partials: array<u32>;

@group(0) @binding(2)
var<uniform> params: vec4<u32>;
// params[0] = num_chunks  params[1] = BW  params[2] = n  params[3] = chunk_points

var<workgroup> hist: array<atomic<u32>, {{ tile }}>;

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
    let part_offset = (window * num_chunks + chunk) * n_cols;
    let chunk_lo = chunk * chunk_points;
    var chunk_hi = chunk_lo + chunk_points;
    if (chunk_hi > n) { chunk_hi = n; }

    let num_tiles = (n_cols + TILE - 1u) / TILE;
    for (var t: u32 = 0u; t < num_tiles; t = t + 1u) {
        let tile_lo = t * TILE;
        let tile_hi = tile_lo + TILE;

        // Zero this tile's shared histogram.
        for (var s: u32 = tid; s < TILE; s = s + WG) {
            atomicStore(&hist[s], 0u);
        }
        workgroupBarrier();

        // Tally every column index in this chunk that falls in this tile.
        for (var i: u32 = chunk_lo + tid; i < chunk_hi; i = i + WG) {
            let col = all_csr_col_idx[cci_offset + i];
            if (col >= tile_lo && col < tile_hi) {
                atomicAdd(&hist[col - tile_lo], 1u);
            }
        }
        workgroupBarrier();

        // Store this tile's counts to the chunk's partial row (one writer
        // per cell — plain store, no atomic).
        for (var s: u32 = tid; s < TILE; s = s + WG) {
            let col = tile_lo + s;
            if (col < n_cols) {
                partials[part_offset + col] = atomicLoad(&hist[s]);
            }
        }
        workgroupBarrier();
    }

    {{{ recompile }}}
}
