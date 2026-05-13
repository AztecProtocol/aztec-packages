// Parallel transpose — Phase 1 of 3: count nonzeros per column.
//
// Splits the per-subtask serial transpose into three independent kernels.
// At N=2^16, the original single-thread-per-subtask pass measured ~65 ms
// of GPU time (one quarter of total). The three-phase variant moves
// counting and scattering to n*T threads (1M+ at N=2^16, T=16) while
// keeping the prefix-sum scan in T threads (cheap: ~64k ops/thread).
//
// Phase 1 contract:
//   - Input: all_csr_col_idx[T * n] — same as the serial path.
//   - Output: all_csc_col_ptr[T * (n_cols + 1)] holds, after this kernel,
//     `count[col + 1]` for each (subtask, col) pair (entry 0 of each
//     subtask is left at 0). Bit-identical to what the serial transpose
//     leaves between its line-54 count loop and its line-58 scan loop.
//
// Dispatch: input_size threads in X × num_subtasks in Y. One thread per
// (i, subtask) pair.

@group(0) @binding(0)
var<storage, read> all_csr_col_idx: array<u32>;

@group(0) @binding(1)
var<storage, read_write> all_csc_col_ptr: array<atomic<u32>>;

@group(0) @binding(2)
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

    let col = all_csr_col_idx[cci_offset + i];
    atomicAdd(&all_csc_col_ptr[ccp_offset + col + 1u], 1u);

    {{{ recompile }}}
}
