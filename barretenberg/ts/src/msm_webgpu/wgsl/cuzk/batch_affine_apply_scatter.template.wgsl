{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}

// Apply + scatter kernel for the batch-affine SMVP pipeline.
//
// Cross-subtask parallel dispatch: ONE dispatch per round covering ALL
// subtasks. Geometry: (apply_x_groups, 1, num_subtasks). Each subtask
// is a Z workgroup-row; one thread per (subtask, pair_slot) pair.
//
// Indirect-lookup design: instead of carrying P / Q coordinates in
// dedicated pair-pool buffers, we re-fetch them via the (bucket_global,
// q_cursor) pair stored by the schedule kernel:
//
//   pair_target_meta[i] = vec2<u32>(bucket_global, q_cursor)
//     P  = running_x/y[bucket_global]
//     Q  = new_point_x/y[val_idx[(bucket_global / num_columns) * input_size + q_cursor]]
//
// This re-derives the operands at minor extra cost but cuts the storage
// binding count to fit the WebGPU baseline of 8 storage buffers per
// stage. (Binding 8 is the uniform; uniforms are counted separately.)
//
// CALLER CONTRACT: every pair has P.x != Q.x (collision case is filtered
// by the scheduler — see batch_affine_schedule.template.wgsl).

@group(0) @binding(0)
var<storage, read> val_idx: array<u32>;
@group(0) @binding(1)
var<storage, read> new_point_x: array<BigInt>;
@group(0) @binding(2)
var<storage, read> new_point_y: array<BigInt>;

@group(0) @binding(3)
var<storage, read_write> running_x: array<BigInt>;
@group(0) @binding(4)
var<storage, read_write> running_y: array<BigInt>;

// pair_target_meta packs (bucket_global, q_cursor) per pair as TWO u32s.
//   pair_target_meta[2*i]     = bucket_global
//   pair_target_meta[2*i + 1] = q_cursor
// See batch_affine_schedule.template.wgsl for the rationale.
@group(0) @binding(5)
var<storage, read> pair_target_meta: array<u32>;
@group(0) @binding(6)
var<storage, read> inv_deltas: array<BigInt>;
// Per-subtask atomic counters. count_buf[subtask_idx] gives the number
// of active pairs the schedule kernel emitted for that subtask in this
// round. Bound as atomic-storage so we can atomicLoad it (cross-shader
// visibility of atomicAdd writes from the schedule kernel).
@group(0) @binding(7)
var<storage, read_write> count_buf: array<atomic<u32>>;

// params[0] = num_columns
// params[1] = input_size
// params[2] = unused
// params[3] = unused
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
    var q_x: BigInt = new_point_x[pt_idx];
    var q_y: BigInt = new_point_y[pt_idx];

    var p_x: BigInt = running_x[bucket_global];
    var p_y: BigInt = running_y[bucket_global];

    var inv_d: BigInt = inv_deltas[slot_global];

    // λ = (Q.y - P.y) * inv_delta
    var dy: BigInt = fr_sub(&q_y, &p_y);
    var lambda: BigInt = montgomery_product(&dy, &inv_d);

    // R.x = λ^2 - P.x - Q.x
    var lambda_sq: BigInt = montgomery_product(&lambda, &lambda);
    var t1: BigInt = fr_sub(&lambda_sq, &p_x);
    var r_x: BigInt = fr_sub(&t1, &q_x);

    // R.y = λ * (P.x - R.x) - P.y
    var dx_back: BigInt = fr_sub(&p_x, &r_x);
    var ldx: BigInt = montgomery_product(&lambda, &dx_back);
    var r_y: BigInt = fr_sub(&ldx, &p_y);

    running_x[bucket_global] = r_x;
    running_y[bucket_global] = r_y;

    {{{ recompile }}}
}
