{{> structs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> bigint_funcs }}
{{> ec_funcs }}

// Input buffers
@group(0) @binding(0)
var<storage, read> row_ptr: array<u32>;
@group(0) @binding(1)
var<storage, read> val_idx: array<u32>;
@group(0) @binding(2)
var<storage, read> new_point_x: array<BigInt>;
@group(0) @binding(3)
var<storage, read> new_point_y: array<BigInt>;

// Output buffers
@group(0) @binding(4)
var<storage, read_write> bucket_x: array<BigInt>;
@group(0) @binding(5)
var<storage, read_write> bucket_y: array<BigInt>;
@group(0) @binding(6)
var<storage, read_write> bucket_z: array<BigInt>;

// Params buffer
@group(0) @binding(7)
var<uniform> params: vec4<u32>;

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

fn get_paf() -> Point {
    var result: Point;
    result.y = get_r();
    return result;
}

// This double-and-add code is adapted from the ZPrize test harness:
// https://github.com/demox-labs/webgpu-msm/blob/main/src/reference/webgpu/wgsl/Curve.ts#L78
fn double_and_add(point: Point, scalar: u32) -> Point {
    // Set result to the point at infinity
    var result: Point = get_paf();

    var s = scalar;
    var temp = point;

    while (s != 0u) {
        if ((s & 1u) == 1u) {
            result = add_points(result, temp);
        }
        temp = double_point(temp);
        s = s >> 1u;
    }
    return result;
}

// Point negation only involves multiplying the Y coordinate by -1 in
// the field
fn negate_point(point: Point) -> Point {
    var p = get_p();
    var y = point.y;
    var neg_y: BigInt;
    bigint_sub(&p, &y, &neg_y);
    return Point(point.x, neg_y, point.z);
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

    // Define custom subtask_idx
    let subtask_idx = (id / h);

    var inf = get_paf();

    let rp_offset = (subtask_idx + subtask_offset) * (num_columns + 1u);

    // As we use the signed bucket index technique, each thread handles two
    // buckets.
    for (var j = 0u; j < 2u; j ++) {
        var row_idx = (id % h) + h;
        if (j == 1u) {
            row_idx = h - (id % h);
        }

        if (j == 0u && id % h == 0u) {
            row_idx = 0u;
        }

        // Skip the chunk=0 row (row h). The (j=1, id%h=0) thread would
        // otherwise iterate through every scalar whose signed chunk is 0
        // — at the top subtask of BN254 Fr this is nearly all of them
        // (random Fr < 2^254 means chunk_17's top bits are zero, and most
        // scalars don't propagate a carry that far) — and write nothing
        // because bucket_idx = 0 is the "no contribution" sentinel. One
        // thread spinning through n/2 mixed-adds is enough to trip
        // Chrome's GPU-process watchdog at n >= 2^17, dropping the device
        // and leaving bucket buffers at their initial (zero) state. Bail
        // before the inner loop runs.
        if (j == 1u && id % h == 0u) {
            continue;
        }

        let row_begin = row_ptr[rp_offset + row_idx];
        let row_end = row_ptr[rp_offset + row_idx + 1u];
        var sum = inf;

        // Add up all the points in the bucket.
        //
        // Jacobian-mixed-add hot path: every `pt` loaded here has Z = R
        // (Montgomery 1) by construction, so we call `add_points_mixed`
        // which uses the Z2=1 formula (7M+4S) instead of the general
        // Jacobian add (11M+5S). `pt.z` is ignored by add_points_mixed —
        // we still set it so the Point struct is fully initialised.
        //
        // Use the NO-COLLISION variant: SRS bases are linearly independent
        // random points in G1, so the running bucket sum can never
        // affinely equal a fresh SRS point being added (would require a
        // discrete-log accident). Saves 2 × bigint_eq per call. The
        // identity short-circuit at the top of the function is kept
        // (genuine: first iter has sum.z == 0).
        for (var k = row_begin; k < row_end; k ++) {
            let idx = val_idx[(subtask_idx + subtask_offset) * input_size + k];

            var x = new_point_x[idx];
            var y = new_point_y[idx];
            var z = get_r();
            let pt = Point(x, y, z);

            sum = add_points_mixed_no_collision(sum, pt);
        }

        // Negate the point if the recovered bucket index is negative.
        // Since we've added half_num_columns to each scalar chunk in
        // convert_point_coords_and_decompose_scalars.template.wgsl, we know if
        // the original bucket index is negative if it is less than
        // half_num_columns.
        var bucket_idx = 0u;
        if (h > row_idx) {
            bucket_idx = h - row_idx;
            sum = negate_point(sum);
        } else {
            bucket_idx = row_idx - h;
        }

        let bi = id + subtask_offset * h;

        if (bucket_idx > 0u) {
            // Store the result in buckets[thread_id]. Each thread must use
            // a unique storage location (thread_id) to prevent race
            // conditions.
            if (j == 1) {
                // Since the point has been set, add to it.
                let bucket = Point(
                    bucket_x[bi],
                    bucket_y[bi],
                    bucket_z[bi]
                );
                sum = add_points(bucket, sum);
            }

            // Set the point. Since no point has been set when j == 0, we can just
            // overwrite the data.
            bucket_x[bi] = sum.x;
            bucket_y[bi] = sum.y;
            bucket_z[bi] = sum.z;
        }
    }

    {{{ recompile }}}
}
