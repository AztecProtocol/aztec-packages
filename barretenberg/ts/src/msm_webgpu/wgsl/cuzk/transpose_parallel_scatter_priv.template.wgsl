// Parallel transpose — Phase 3 of 3: scatter point indices into CSC slots.
//
// Privatized variant of transpose_parallel_scatter, for GPUs with weak
// contended-atomic throughput (Adreno). ONE workgroup per subtask
// (window): the per-column write cursor lives in workgroup-shared memory.
// Because one workgroup owns the whole subtask, every point of a column
// is allocated by the same shared cursor — so there are NO global atomics
// at all. The base kernel does one contended global atomicAdd per point.
//
// For each point: col = csr_col_idx[i]; reserve a per-column slot via a
// shared atomicAdd on curr[col]; write i into csc_val_idxs at
// csc_col_ptr[col] + slot. If n_cols exceeds the shared cursor capacity
// TILE the columns are covered in ceil(n_cols / TILE) tiles, each
// re-scanning the (coalesced) column array.
//
// Within-column ordering is arrival order across the workgroup's threads
// — a valid permutation, identical multiset per column to the base
// kernel. Downstream (bucket accumulate) sums each bucket and is
// order-independent, so the MSM result is unchanged.
//
// Dispatch: num_subtasks workgroups in X, one workgroup per subtask.

const WG: u32 = {{ workgroup_size }}u;
const TILE: u32 = {{ tile }}u;          // shared cursor capacity (entries)

@group(0) @binding(0)
var<storage, read> all_csr_col_idx: array<u32>;

// Per-column start offsets (the scan kernel's output).
@group(0) @binding(1)
var<storage, read> all_csc_col_ptr: array<u32>;

@group(0) @binding(2)
var<storage, read_write> all_csc_val_idxs: array<u32>;

@group(0) @binding(3)
var<uniform> params: vec3<u32>;
// params[1] = n_cols   params[2] = input_size (column indices per subtask)

var<workgroup> curr: array<atomic<u32>, {{ tile }}>;

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

        // Zero this tile's shared per-column write cursors.
        for (var s: u32 = tid; s < TILE; s = s + WG) {
            atomicStore(&curr[s], 0u);
        }
        workgroupBarrier();

        // Place every point whose column falls in this tile.
        for (var i: u32 = tid; i < input_size; i = i + WG) {
            let col = all_csr_col_idx[cci_offset + i];
            if (col >= tile_lo && col < tile_hi) {
                let local_slot = atomicAdd(&curr[col - tile_lo], 1u);
                let global_slot = all_csc_col_ptr[ccp_offset + col] + local_slot;
                all_csc_val_idxs[cci_offset + global_slot] = i;
            }
        }
        workgroupBarrier();
    }

    {{{ recompile }}}
}
