// Parallel transpose — Phase 1 of 3: count nonzeros per column.
//
// Privatized-histogram variant of transpose_parallel_count, for GPUs with
// weak contended-atomic throughput (Adreno). ONE workgroup per subtask
// (window): the workgroup's threads cooperatively scan all of the
// subtask's column indices and tally them into a histogram in
// workgroup-shared memory. Because one workgroup owns the whole subtask,
// the shared histogram IS the complete per-column count — it is written
// straight to all_csc_col_ptr with NO global atomics at all. Only on-chip
// (shared) atomics are used.
//
// The base kernel does one global atomicAdd per (point, subtask) onto a
// per-column counter. Bucketing maps many points to the same column, so
// those atomics are heavily contended — fine on GPUs with strong atomic
// units, but they serialize hard where contended-atomic throughput is
// weak. Shared-memory atomics stay on-chip; the only global traffic is
// one plain store per column.
//
// If n_cols exceeds the shared histogram capacity TILE, the columns are
// covered in ceil(n_cols / TILE) tiles, each re-scanning the (coalesced,
// cheap) column array.
//
// Output (bit-identical to transpose_parallel_count): for each
// (subtask, col), all_csc_col_ptr[subtask*(n_cols+1) + col + 1] =
// count(col); entry 0 of each subtask is left at 0.
//
// Dispatch: num_subtasks workgroups in X, one workgroup per subtask.

const WG: u32 = {{ workgroup_size }}u;
const TILE: u32 = {{ tile }}u;          // shared histogram capacity (entries)

@group(0) @binding(0)
var<storage, read> all_csr_col_idx: array<u32>;

// Plain (non-atomic) here: the privatized merge writes each entry exactly
// once. The scan kernel views the same buffer as atomic for its in-place
// pass — a buffer's atomic-ness is per-shader and the passes never overlap.
@group(0) @binding(1)
var<storage, read_write> all_csc_col_ptr: array<u32>;

@group(0) @binding(2)
var<uniform> params: vec3<u32>;
// params[1] = n_cols   params[2] = input_size (column indices per subtask)

var<workgroup> hist: array<atomic<u32>, {{ tile }}>;

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(local_invocation_id) lid: vec3<u32>,
        @builtin(workgroup_id) wid: vec3<u32>) {
    let tid = lid.x;
    let subtask = wid.x;

    let n_cols = params[1];
    let input_size = params[2];
    let cci_offset = subtask * input_size;
    let ccp_offset = subtask * (n_cols + 1u);

    let num_tiles = (n_cols + TILE - 1u) / TILE;
    for (var t: u32 = 0u; t < num_tiles; t = t + 1u) {
        let tile_lo = t * TILE;
        let tile_hi = tile_lo + TILE;

        // Zero this tile's shared histogram.
        for (var s: u32 = tid; s < TILE; s = s + WG) {
            atomicStore(&hist[s], 0u);
        }
        workgroupBarrier();

        // Tally every column index that falls in this tile.
        for (var i: u32 = tid; i < input_size; i = i + WG) {
            let col = all_csr_col_idx[cci_offset + i];
            if (col >= tile_lo && col < tile_hi) {
                atomicAdd(&hist[col - tile_lo], 1u);
            }
        }
        workgroupBarrier();

        // The shared histogram is the exact count — store it (plain store,
        // each entry written by exactly one thread).
        for (var s: u32 = tid; s < TILE; s = s + WG) {
            let col = tile_lo + s;
            if (col < n_cols) {
                all_csc_col_ptr[ccp_offset + col + 1u] = atomicLoad(&hist[s]);
            }
        }
        workgroupBarrier();
    }

    if (tid == 0u) {
        all_csc_col_ptr[ccp_offset] = 0u;
    }

    {{{ recompile }}}
}
