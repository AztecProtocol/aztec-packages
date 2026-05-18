{{> structs }}

// Init kernel for the batch-affine SMVP pipeline.
// NOTE: this kernel uses only u32 / BigInt-struct copy operations and
// does not call any function from `bigint_funcs`, `field_funcs`, or
// `montgomery_product_funcs`. We therefore omit those partials so the
// kernel doesn't drag in references to NUM_WORDS / WORD_SIZE / MASK
// constants (which are defined in `montgomery_product_funcs` and are
// not needed here).
//
// Dispatched ONCE per MSM, covering all T * num_columns buckets across
// all subtasks. One thread per (subtask, bucket_local) pair.
//
// Seeds running_x/y[bucket_global] from val_idx[row_begin] for non-empty
// buckets and sets:
//   - bucket_cursor[bucket_global] = row_begin + 1 (for non-empty)
//                                  = row_end       (for empty)
//   - bucket_active[bucket_global] = 1 / 0
//
// Cursor stores the SUBTASK-RELATIVE k value (range [row_begin, row_end))
// — same convention the legacy SMVP uses internally. The schedule and
// apply_scatter kernels combine `subtask_idx * input_size + cursor` to
// reach into val_idx at dispatch time.

// row_ptr layout: (num_subtasks * (num_columns + 1)) entries.
// row_ptr[subtask_idx * (num_columns + 1) + bucket_local] = row_begin
@group(0) @binding(0)
var<storage, read> row_ptr: array<u32>;
// val_idx layout: (num_subtasks * input_size) entries.
@group(0) @binding(1)
var<storage, read> val_idx: array<u32>;
{{#packed}}
@group(0) @binding(2)
var<storage, read> new_point_x: array<vec4<u32>>;
@group(0) @binding(3)
var<storage, read> new_point_y: array<vec4<u32>>;

// Workspace: (num_subtasks * num_columns) entries.
// running_x/y[subtask_idx * num_columns + bucket_local] = current sum
@group(0) @binding(4)
var<storage, read_write> running_x: array<vec4<u32>>;
@group(0) @binding(5)
var<storage, read_write> running_y: array<vec4<u32>>;
{{/packed}}
{{^packed}}
@group(0) @binding(2)
var<storage, read> new_point_x: array<BigInt>;
@group(0) @binding(3)
var<storage, read> new_point_y: array<BigInt>;

// Workspace: (num_subtasks * num_columns) entries.
// running_x/y[subtask_idx * num_columns + bucket_local] = current sum
@group(0) @binding(4)
var<storage, read_write> running_x: array<BigInt>;
@group(0) @binding(5)
var<storage, read_write> running_y: array<BigInt>;
{{/packed}}
@group(0) @binding(6)
var<storage, read_write> bucket_cursor: array<u32>;
@group(0) @binding(7)
var<storage, read_write> bucket_active: array<u32>;

// params[0] = total_buckets   (= num_subtasks * num_columns)
// params[1] = num_columns
// params[2] = input_size
// params[3] = unused
@group(0) @binding(8)
var<uniform> params: vec4<u32>;

{{#packed}}
// Both new_point_* and running_* are packed 8×u32 (two vec4<u32>). The
// seed copy is a layout-identical raw element copy — no unpack/pack
// needed, the destination element bytes equal the source element bytes.
fn copy_packed(dst_elem: u32, src_elem: u32,
                dst: ptr<storage, array<vec4<u32>>, read_write>,
                src: ptr<storage, array<vec4<u32>>, read>) {
    (*dst)[2u * dst_elem]      = (*src)[2u * src_elem];
    (*dst)[2u * dst_elem + 1u] = (*src)[2u * src_elem + 1u];
}
{{/packed}}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let bucket_global = global_id.x;
    let total_buckets = params[0];
    let num_columns = params[1];
    let input_size = params[2];

    if (bucket_global >= total_buckets) {
        return;
    }

    let subtask_idx = bucket_global / num_columns;
    let bucket_local = bucket_global % num_columns;

    let rp_offset = subtask_idx * (num_columns + 1u);
    let vi_offset = subtask_idx * input_size;

    let row_begin = row_ptr[rp_offset + bucket_local];
    let row_end = row_ptr[rp_offset + bucket_local + 1u];

    if (row_begin >= row_end) {
        // Empty bucket. Cursor at row_end so schedule skips it; active
        // = 0 marks it for finalize to ignore.
        bucket_cursor[bucket_global] = row_end;
        bucket_active[bucket_global] = 0u;
        return;
    }

    // Seed from first point in the bucket.
    let pt_idx = val_idx[vi_offset + row_begin];
{{#packed}}
    copy_packed(bucket_global, pt_idx, &running_x, &new_point_x);
    copy_packed(bucket_global, pt_idx, &running_y, &new_point_y);
{{/packed}}
{{^packed}}
    running_x[bucket_global] = new_point_x[pt_idx];
    running_y[bucket_global] = new_point_y[pt_idx];
{{/packed}}
    bucket_cursor[bucket_global] = row_begin + 1u;
    bucket_active[bucket_global] = 1u;

    {{{ recompile }}}
}
