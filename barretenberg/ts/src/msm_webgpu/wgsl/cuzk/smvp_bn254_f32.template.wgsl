// 23-bit f32 mirror of `smvp_bn254.template.wgsl`. SMVP per-bucket
// Jacobian accumulation, with every field/curve op routed through the
// f32-Montgomery stack (`montgomery_product_f32`, `fr_*_f32`,
// `add_points_mixed_no_collision_f32`).
//
// Wire-format note: `point_x` / `point_y` arrays now hold `BigIntF32`
// values (12 × f32 limbs each), and `bucket_x/y/z` write `BigIntF32`.
// Layout is one BigIntF32 per slot (no struct-of-arrays interleave),
// matching the u32 path's per-coordinate buffer convention.

@group(0) @binding(0)
var<storage, read> row_ptr: array<u32>;
@group(0) @binding(1)
var<storage, read> val_idx: array<u32>;
@group(0) @binding(2)
var<storage, read> new_point_x: array<BigIntF32>;
@group(0) @binding(3)
var<storage, read> new_point_y: array<BigIntF32>;

@group(0) @binding(4)
var<storage, read_write> bucket_x: array<BigIntF32>;
@group(0) @binding(5)
var<storage, read_write> bucket_y: array<BigIntF32>;
@group(0) @binding(6)
var<storage, read_write> bucket_z: array<BigIntF32>;

@group(0) @binding(7)
var<uniform> params: vec4<u32>;

fn get_r_local_f32() -> BigIntF32 {
    var r: BigIntF32;
{{{ r_limbs_f32 }}}
    return r;
}

// Point-at-infinity: identity sentinel = (any, Mont-1, 0). We write
// Mont-1 to Y so a future `is_zero_f32(&y)` would return false if
// someone misreads the layout, but downstream code only checks Z=0.
fn get_paf_f32() -> PointF32 {
    var result: PointF32;
    result.y = get_r_local_f32();
    return result;
}

// p - y mod p. Assumes 0 <= y < p (fr_*_f32 outputs are canonical).
fn negate_point_f32(point: PointF32) -> PointF32 {
    var p_local = get_p_f32();
    var y = point.y;
    var neg_y: BigIntF32;
    let _b = bigint_f32_sub(&p_local, &y, &neg_y);
    var result: PointF32;
    result.x = point.x;
    result.y = neg_y;
    result.z = point.z;
    return result;
}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let input_size = params[0];
    let num_y_workgroups = params[1];
    let num_z_workgroups = params[2];
    let subtask_offset = params[3];

    let gidx = global_id.x;
    let gidy = global_id.y;
    var gidz = global_id.z;
    let id = (gidx * num_y_workgroups + gidy) * num_z_workgroups + gidz;

    let num_columns = {{ num_columns }}u;
    let l = num_columns;
    let h = {{ half_num_columns }}u;

    let subtask_idx = (id / h);

    var inf = get_paf_f32();

    let rp_offset = (subtask_idx + subtask_offset) * (num_columns + 1u);

    for (var j = 0u; j < 2u; j ++) {
        var row_idx = (id % h) + h;
        if (j == 1u) {
            row_idx = h - (id % h);
        }

        if (j == 0u && id % h == 0u) {
            row_idx = 0u;
        }

        // See u32 smvp_bn254: bail on (j=1, id%h=0) to avoid the watchdog-
        // tripping scan-over-all-scalars at the top subtask.
        if (j == 1u && id % h == 0u) {
            continue;
        }

        let row_begin = row_ptr[rp_offset + row_idx];
        let row_end = row_ptr[rp_offset + row_idx + 1u];
        var sum = inf;

        // Mixed-add hot path: each fresh point has Z=R (Montgomery 1).
        // SRS bases are linearly independent — no-collision is safe.
        for (var k = row_begin; k < row_end; k ++) {
            let idx = val_idx[(subtask_idx + subtask_offset) * input_size + k];

            var x = new_point_x[idx];
            var y = new_point_y[idx];
            var z = get_r_local_f32();
            var pt: PointF32;
            pt.x = x;
            pt.y = y;
            pt.z = z;

            sum = add_points_mixed_no_collision_f32(sum, pt);
        }

        var bucket_idx = 0u;
        if (h > row_idx) {
            bucket_idx = h - row_idx;
            sum = negate_point_f32(sum);
        } else {
            bucket_idx = row_idx - h;
        }

        let bi = id + subtask_offset * h;

        if (bucket_idx > 0u) {
            if (j == 1) {
                var bucket: PointF32;
                bucket.x = bucket_x[bi];
                bucket.y = bucket_y[bi];
                bucket.z = bucket_z[bi];
                sum = add_points_f32(bucket, sum);
            }

            bucket_x[bi] = sum.x;
            bucket_y[bi] = sum.y;
            bucket_z[bi] = sum.z;
        }
    }

    {{{ recompile }}}
}
