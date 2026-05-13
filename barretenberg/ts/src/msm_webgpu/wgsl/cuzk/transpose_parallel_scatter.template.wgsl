// Parallel transpose — Phase 3 of 3: scatter point indices into their
// CSC slot.
//
// At this point all_csc_col_ptr holds the per-column start offsets
// (Phase 2 output), and all_curr is zero. For each (i, subtask), look
// up col = csr_col_idx[i], reserve a slot via atomicAdd on
// all_curr[col], and write i into all_csc_val_idxs at
// (col_ptr[col] + slot).
//
// Bit-for-bit equivalent to the serial scatter loop in
// transpose_serial.wgsl lines 67-73, modulo the within-column ordering:
// the parallel version may store points within a column in arrival
// order across the n*T threads, whereas the serial version stores them
// in i-ascending order. Downstream SMVP doesn't depend on per-column
// ordering — it iterates the whole bucket — so this is invisible.
//
// Dispatch: input_size threads in X × num_subtasks in Y. One thread
// per (i, subtask) pair.

@group(0) @binding(0)
var<storage, read> all_csr_col_idx: array<u32>;

// Read-only at this stage (offsets, computed by the scan kernel).
@group(0) @binding(1)
var<storage, read> all_csc_col_ptr: array<u32>;

@group(0) @binding(2)
var<storage, read_write> all_csc_val_idxs: array<u32>;

// Per-column write counters; initially 0, atomicAdd'd to find each
// thread's slot.
@group(0) @binding(3)
var<storage, read_write> all_curr: array<atomic<u32>>;

@group(0) @binding(4)
var<uniform> params: vec3<u32>;

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let i = global_id.x;
    let subtask_idx = global_id.y;

    let n = params[1];
    let input_size = params[2];

    if (i >= input_size) {
        return;
    }

    let ccp_offset = subtask_idx * (n + 1u);
    let cci_offset = subtask_idx * input_size;
    let curr_offset = subtask_idx * n;

    let col = all_csr_col_idx[cci_offset + i];
    let local_slot = atomicAdd(&all_curr[curr_offset + col], 1u);
    let global_slot = all_csc_col_ptr[ccp_offset + col] + local_slot;
    all_csc_val_idxs[cci_offset + global_slot] = i;

    {{{ recompile }}}
}
