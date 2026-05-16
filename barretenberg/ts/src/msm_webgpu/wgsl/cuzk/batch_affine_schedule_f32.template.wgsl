// 23-bit f32 mirror of `batch_affine_schedule.template.wgsl`.
//
// Per-round scheduler. Each thread inspects one (subtask, bucket) pair,
// reads the next point Q's x-coordinate (in f32-Mont form), computes
// delta = Q.x - P.x, skips if delta == 0, otherwise atomically reserves
// a slot in the subtask's pair pool and writes (delta, bucket_global,
// q_cursor) for the downstream batch-inverse and apply stages.
//
// Wire format: every BigInt → BigIntF32; every fr_sub → fr_sub_f32.

@group(0) @binding(0)
var<storage, read> row_ptr: array<u32>;
@group(0) @binding(1)
var<storage, read> val_idx: array<u32>;
@group(0) @binding(2)
var<storage, read> new_point_x: array<BigIntF32>;
@group(0) @binding(3)
var<storage, read> running_x: array<BigIntF32>;

@group(0) @binding(4)
var<storage, read_write> bucket_cursor: array<u32>;
@group(0) @binding(5)
var<storage, read_write> pair_delta: array<BigIntF32>;
@group(0) @binding(6)
var<storage, read_write> pair_target_meta: array<u32>;
@group(0) @binding(7)
var<storage, read_write> pair_counter: array<atomic<u32>>;

// params[0] = num_columns
// params[1] = input_size
@group(0) @binding(8)
var<uniform> params: vec4<u32>;

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let bucket_local = global_id.x;
    let subtask_idx = global_id.z;
    let num_columns = params[0];
    let input_size = params[1];
    if (bucket_local >= num_columns) {
        return;
    }

    let bucket_global = subtask_idx * num_columns + bucket_local;
    let rp_offset = subtask_idx * (num_columns + 1u);
    let vi_offset = subtask_idx * input_size;

    let cursor = bucket_cursor[bucket_global];
    let row_end = row_ptr[rp_offset + bucket_local + 1u];
    if (cursor >= row_end) {
        return;
    }

    let pt_idx = val_idx[vi_offset + cursor];
    var q_x: BigIntF32 = new_point_x[pt_idx];
    var p_x: BigIntF32 = running_x[bucket_global];

    var delta: BigIntF32 = fr_sub_f32(&q_x, &p_x);

    // Collision check: SRS bases are linearly independent so delta == 0
    // is statistically impossible; the schedule kernel skips silently.
    if (bigint_f32_is_zero(&delta)) {
        return;
    }

    let slot_local = atomicAdd(&pair_counter[subtask_idx], 1u);
    let slot_global = subtask_idx * num_columns + slot_local;

    pair_delta[slot_global] = delta;
    pair_target_meta[2u * slot_global] = bucket_global;
    pair_target_meta[2u * slot_global + 1u] = cursor;
    bucket_cursor[bucket_global] = cursor + 1u;

    {{{ recompile }}}
}
