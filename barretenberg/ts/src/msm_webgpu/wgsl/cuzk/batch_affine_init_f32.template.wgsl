// 23-bit f32 mirror of `batch_affine_init.template.wgsl`. Wire format
// is `BigIntF32` (12 × f32 limbs). The kernel only copies BigIntF32
// values between buffers; no field ops are invoked, so the field /
// montgomery partials don't need to be pulled in. The shader source
// uses `BigIntF32` directly — `gen_curve_f32_shader()` (which emits
// the struct + helpers) is prepended by the ShaderManager method.

// row_ptr layout: (num_subtasks * (num_columns + 1)) entries.
// row_ptr[subtask_idx * (num_columns + 1) + bucket_local] = row_begin
@group(0) @binding(0)
var<storage, read> row_ptr: array<u32>;
// val_idx layout: (num_subtasks * input_size) entries.
@group(0) @binding(1)
var<storage, read> val_idx: array<u32>;
@group(0) @binding(2)
var<storage, read> new_point_x: array<BigIntF32>;
@group(0) @binding(3)
var<storage, read> new_point_y: array<BigIntF32>;

@group(0) @binding(4)
var<storage, read_write> running_x: array<BigIntF32>;
@group(0) @binding(5)
var<storage, read_write> running_y: array<BigIntF32>;
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
        bucket_cursor[bucket_global] = row_end;
        bucket_active[bucket_global] = 0u;
        return;
    }

    let pt_idx = val_idx[vi_offset + row_begin];
    running_x[bucket_global] = new_point_x[pt_idx];
    running_y[bucket_global] = new_point_y[pt_idx];
    bucket_cursor[bucket_global] = row_begin + 1u;
    bucket_active[bucket_global] = 1u;

    {{{ recompile }}}
}
