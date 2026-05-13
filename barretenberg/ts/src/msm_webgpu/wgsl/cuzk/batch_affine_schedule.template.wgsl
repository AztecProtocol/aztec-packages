{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}

// Per-round scheduler for the batch-affine SMVP pipeline.
//
// Cross-subtask parallel dispatch: ONE dispatch per round covering ALL
// subtasks. Geometry: (ceil(num_columns / wg_size), 1, num_subtasks).
// Each subtask is a Z workgroup-row; one thread per (subtask, bucket)
// pair. The previous design ran a sequential t-loop on the host, paying
// ~30-50 µs/launch × T × MAX_ROUNDS × 3 stages ≈ 50-80 ms of pure CPU
// dispatch overhead at T=16, MAX_ROUNDS=32. Going parallel collapses
// that to MAX_ROUNDS × 3 ≈ 96 launches.
//
// Per-subtask pair pool: each subtask owns a slot range of length
// num_columns inside the shared pool. pair_counter is now T atomics
// (one per subtask) instead of one global. apply_scatter mirrors this
// layout.

@group(0) @binding(0)
var<storage, read> row_ptr: array<u32>;
@group(0) @binding(1)
var<storage, read> val_idx: array<u32>;
@group(0) @binding(2)
var<storage, read> new_point_x: array<BigInt>;
@group(0) @binding(3)
var<storage, read> running_x: array<BigInt>;

@group(0) @binding(4)
var<storage, read_write> bucket_cursor: array<u32>;
@group(0) @binding(5)
var<storage, read_write> pair_delta: array<BigInt>;
// pair_target_meta packs (bucket_global, q_cursor) per pair as TWO u32s.
//   pair_target_meta[2*i]     = bucket_global
//   pair_target_meta[2*i + 1] = q_cursor
// Stored as array<u32> rather than array<vec2<u32>> to sidestep
// occasional Dawn/Metal layout quirks with 8-byte vector elements
// in storage buffers. The on-disk byte layout is identical.
@group(0) @binding(6)
var<storage, read_write> pair_target_meta: array<u32>;
// One atomic counter per subtask. pair_counter[subtask_idx] gives the
// number of active pairs scheduled for that subtask in this round.
@group(0) @binding(7)
var<storage, read_write> pair_counter: array<atomic<u32>>;

// params[0] = num_columns
// params[1] = input_size
// params[2] = unused
// params[3] = unused
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

    // Look up Q's index in new_point_x.
    let pt_idx = val_idx[vi_offset + cursor];
    var q_x: BigInt = new_point_x[pt_idx];
    var p_x: BigInt = running_x[bucket_global];

    // delta = Q.x - P.x. fr_sub returns canonical zero if Q.x == P.x.
    var delta: BigInt = fr_sub(&q_x, &p_x);

    // Collision check.
    var nonzero: bool = false;
    for (var i = 0u; i < NUM_WORDS; i = i + 1u) {
        if (delta.limbs[i] != 0u) {
            nonzero = true;
            break;
        }
    }
    if (!nonzero) {
        // Collision (delta == 0). Skip silently — caller assumes SRS
        // inputs where this is statistically impossible.
        return;
    }

    // Reserve a pair slot atomically within this subtask's pool slice.
    let slot_local = atomicAdd(&pair_counter[subtask_idx], 1u);
    let slot_global = subtask_idx * num_columns + slot_local;

    pair_delta[slot_global] = delta;
    pair_target_meta[2u * slot_global] = bucket_global;
    pair_target_meta[2u * slot_global + 1u] = cursor;
    bucket_cursor[bucket_global] = cursor + 1u;

    {{{ recompile }}}
}
