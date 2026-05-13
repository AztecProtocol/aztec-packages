/// Input storage buffers.
@group(0) @binding(0)
var<storage, read> all_csr_col_idx: array<u32>;

/// Output storage buffers.
@group(0) @binding(1)
var<storage, read_write> all_csc_col_ptr: array<atomic<u32>>;
@group(0) @binding(2)
var<storage, read_write> all_csc_val_idxs: array<u32>;

/// Intermediate storage buffer.
@group(0) @binding(3)
var<storage, read_write> all_curr: array<u32>;

/// Uniform storage buffer. Used instead of shader template constants
/// to avoid recompiling the shader if either value changes.
@group(0) @binding(4)
var<uniform> params: vec3<u32>;

/// Serial transpose algo adapted from Wang et al, 2016, "Parallel
/// Transposition of Sparse Data Structures".
/// https://synergy.cs.vt.edu/pubs/papers/wang-transposition-ics16.pdf

/// This shader implements a serial transpose algorithm, but each thread in
/// the workgroup handles the CSR matrix for a subtask, so num_subtasks
/// transpositions happen in parallel.

/// Note that there is no csr_row_ptr input buffer; rather, we calculate it
/// on the fly using calc_start_end. We also do not rearrange the nonzero
/// elements in-place, but instead output an array of their new positions
/// (all_csc_val_idxs).
@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {    
    /// Subtask id.
    let subtask_idx = global_id.x;

    /// Number of rows.
    let m = params[0];

    /// Number of columns.
    let n = params[1];

    /// Input size.
    let input_size = params[2];

    /// Index offsets depending on the subtask ID (aka thread ID) and the slice length.
    let ccp_offset = subtask_idx * (n + 1u);
    let cci_offset = subtask_idx * input_size;
    let curr_offset = subtask_idx * n;

    /// "Count the number of nonzero elements in each column" (Wang et al, 2016).
    for (var j = 0u; j < input_size; j++) {
        atomicAdd(&all_csc_col_ptr[ccp_offset + all_csr_col_idx[cci_offset + j] + 1u], 1u);
    }

    /// Prefix sum, aka cumulative/incremental sum.
    for (var i = 1u; i < n + 1u; i++) {
        var incremental_sum = atomicLoad(&all_csc_col_ptr[ccp_offset + i - 1u]);
        atomicAdd(&all_csc_col_ptr[ccp_offset + i], incremental_sum);
    }

    /// "Traverse the nonzero elements again and move them to their final
    /// positions determined by the column offsets in csc_col_ptr and their
    /// current relative positions in curr." (Wang et al, 2016).
    var val = 0u;
    for (var j = 0u; j < input_size; j++) {
        var loc = atomicLoad(&all_csc_col_ptr[ccp_offset + all_csr_col_idx[cci_offset + j]]);
        loc += all_curr[curr_offset + all_csr_col_idx[cci_offset + j]];
        all_curr[curr_offset + all_csr_col_idx[cci_offset + j]]++;
        all_csc_val_idxs[cci_offset + loc] = val;
        val++;
    }

    {{{ recompile }}}
}