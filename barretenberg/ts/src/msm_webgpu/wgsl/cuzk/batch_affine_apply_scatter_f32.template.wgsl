// 23-bit f32 mirror of `batch_affine_apply_scatter.template.wgsl`.
// Indirect-lookup apply: re-fetches P / Q via the (bucket_global,
// q_cursor) pair the schedule kernel stored, performs the affine add,
// writes the result back to running_x/y[bucket_global]. All field ops
// in f32-Montgomery form.

@group(0) @binding(0)
var<storage, read> val_idx: array<u32>;
@group(0) @binding(1)
var<storage, read> new_point_x: array<BigIntF32>;
@group(0) @binding(2)
var<storage, read> new_point_y: array<BigIntF32>;

@group(0) @binding(3)
var<storage, read_write> running_x: array<BigIntF32>;
@group(0) @binding(4)
var<storage, read_write> running_y: array<BigIntF32>;

@group(0) @binding(5)
var<storage, read> pair_target_meta: array<u32>;
@group(0) @binding(6)
var<storage, read> inv_deltas: array<BigIntF32>;
@group(0) @binding(7)
var<storage, read_write> count_buf: array<atomic<u32>>;

// params[0] = num_columns
// params[1] = input_size
@group(0) @binding(8)
var<uniform> params: vec4<u32>;

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let i = global_id.x;
    let subtask_idx = global_id.z;
    let num_columns = params[0];
    let input_size = params[1];

    let n = atomicLoad(&count_buf[subtask_idx]);
    if (i >= n) {
        return;
    }

    let slot_global = subtask_idx * num_columns + i;
    let bucket_global = pair_target_meta[2u * slot_global];
    let q_cursor = pair_target_meta[2u * slot_global + 1u];

    let vi_offset = subtask_idx * input_size;
    let pt_idx = val_idx[vi_offset + q_cursor];
    var q_x: BigIntF32 = new_point_x[pt_idx];
    var q_y: BigIntF32 = new_point_y[pt_idx];

    var p_x: BigIntF32 = running_x[bucket_global];
    var p_y: BigIntF32 = running_y[bucket_global];

    var inv_d: BigIntF32 = inv_deltas[slot_global];

    var dy: BigIntF32 = fr_sub_f32(&q_y, &p_y);
    var lambda: BigIntF32 = montgomery_product_f32(&dy, &inv_d);

    var lambda_sq: BigIntF32 = montgomery_product_f32(&lambda, &lambda);
    var t1: BigIntF32 = fr_sub_f32(&lambda_sq, &p_x);
    var r_x: BigIntF32 = fr_sub_f32(&t1, &q_x);

    var dx_back: BigIntF32 = fr_sub_f32(&p_x, &r_x);
    var ldx: BigIntF32 = montgomery_product_f32(&lambda, &dx_back);
    var r_y: BigIntF32 = fr_sub_f32(&ldx, &p_y);

    running_x[bucket_global] = r_x;
    running_y[bucket_global] = r_y;

    {{{ recompile }}}
}
