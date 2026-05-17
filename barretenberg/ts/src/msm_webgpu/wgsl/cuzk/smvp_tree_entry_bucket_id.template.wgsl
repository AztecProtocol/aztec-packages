// Derives entry_bucket_id[i] for every schedule entry, given the
// per-subtask CSR layout used by the existing batch-affine pipeline:
//
//   row_ptr layout: (num_subtasks * (num_columns + 1)) entries.
//     row_ptr[subtask_idx * (num_columns + 1) + bucket_local] = row_begin
//   val_idx layout: (num_subtasks * input_size) entries; entries within
//     one subtask are bucket-sorted by bucket_local.
//
// For entry index `i` (in val_idx):
//   subtask_idx = i / input_size
//   offset      = i % input_size
//   bucket_local = largest B in [0, num_columns] with row_ptr[subtask_idx
//                  * (num_columns + 1) + B] <= offset
//   bucket_global = subtask_idx * num_columns + bucket_local
//
// One thread per entry. Dispatch (ceil(total_entries / TPB), 1, 1).

const TPB: u32 = {{ tpb }}u;

@group(0) @binding(0)
var<storage, read> row_ptr: array<u32>;
@group(0) @binding(1)
var<storage, read_write> entry_bucket_id: array<u32>;

struct Params {
    num_columns: u32,
    input_size: u32,
    num_subtasks: u32,
    pad: u32,
}
@group(0) @binding(2)
var<uniform> params: Params;

@compute
@workgroup_size({{ tpb }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    let total_entries = params.input_size * params.num_subtasks;
    if (i >= total_entries) { return; }

    let subtask_idx = i / params.input_size;
    let offset = i % params.input_size;
    let rp_base = subtask_idx * (params.num_columns + 1u);

    var lo: u32 = 0u;
    var hi: u32 = params.num_columns;
    for (var step: u32 = 0u; step < 32u; step = step + 1u) {
        if (lo >= hi) { break; }
        let mid = (lo + hi + 1u) / 2u;
        if (row_ptr[rp_base + mid] <= offset) {
            lo = mid;
        } else {
            hi = mid - 1u;
        }
    }
    entry_bucket_id[i] = subtask_idx * params.num_columns + lo;

    {{{ recompile }}}
}
