// Companion to csr_to_v2_active_sums: derives the per-bucket counts and
// GLOBAL offsets that drive the v2 pair-tree planner.
//
// row_ptr layout: per subtask, num_columns + 1 entries forming a
// CSR-style prefix sum. row_ptr[s*(num_columns+1) + b + 1] -
// row_ptr[s*(num_columns+1) + b] is bucket b's count; the begin value is
// the subtask-relative start within val_idx / active_sums.
//
// The v2 planner indexes counts/offsets by global bucket id and expects
// offsets in the global active_sums element space, so this shader adds
// subtask * input_size to the subtask-relative begin.
//
// One thread per (subtask, bucket) emits one (count, offset) pair.

@group(0) @binding(0)
var<storage, read> row_ptr: array<u32>;
@group(0) @binding(1)
var<storage, read_write> active_counts: array<u32>;
@group(0) @binding(2)
var<storage, read_write> active_offsets: array<u32>;

// params[0] = num_columns
// params[1] = total_buckets (num_subtasks * num_columns)
// params[2] = input_size   (per-subtask slot stride; globalises offsets)
@group(0) @binding(3)
var<uniform> params: vec4<u32>;

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let id = gid.x;
    let total = params[1];
    if (id >= total) {
        return;
    }

    let num_columns = params[0];
    let input_size = params[2];
    let subtask = id / num_columns;
    let bucket_local = id % num_columns;
    let rp_offset = subtask * (num_columns + 1u);

    let begin = row_ptr[rp_offset + bucket_local];
    let end = row_ptr[rp_offset + bucket_local + 1u];

    active_counts[id] = end - begin;
    active_offsets[id] = subtask * input_size + begin;

    {{{ recompile }}}
}
