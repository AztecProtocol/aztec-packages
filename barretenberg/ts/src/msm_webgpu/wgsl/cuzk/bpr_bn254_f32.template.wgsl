// 23-bit f32 mirror of `bpr_bn254.template.wgsl`. Parallel bucket
// points reduction (two stages). All field/curve ops routed through the
// f32-Montgomery stack.
//
// Mustache flag matrix (matches the u32 path one-for-one):
//   - assume_affine_buckets: SMVP output is affine (Z = R_f or 0); uses
//     mixed-add for m and no-collision Jacobian add for g. Highest
//     opt level, requires batch-affine SMVP buckets.
//   - mixed_safe_buckets: mixed-add for m (inline formula), full safe
//     add_points_f32 for g.
//   - safe_first_add_no_collision: legacy path with add_points_no_collision_f32
//     replacing the first add. Production path for batch-affine SMVP.
//   - none of the above: legacy path with full safe add_points_f32.

@group(0) @binding(0)
var<storage, read_write> bucket_sum_x: array<BigIntF32>;
@group(0) @binding(1)
var<storage, read_write> bucket_sum_y: array<BigIntF32>;
@group(0) @binding(2)
var<storage, read_write> bucket_sum_z: array<BigIntF32>;

@group(0) @binding(3)
var<storage, read_write> g_points_x: array<BigIntF32>;
@group(0) @binding(4)
var<storage, read_write> g_points_y: array<BigIntF32>;
@group(0) @binding(5)
var<storage, read_write> g_points_z: array<BigIntF32>;

@group(0) @binding(6)
var<uniform> params: vec3<u32>;

fn get_r_local_f32() -> BigIntF32 {
    var r: BigIntF32;
{{{ r_limbs_f32 }}}
    return r;
}

fn get_paf_f32() -> PointF32 {
    var p: PointF32;
    p.y = get_r_local_f32();
    return p;
}

fn double_and_add_f32(point: PointF32, scalar: u32) -> PointF32 {
    var result: PointF32 = get_paf_f32();
    var s = scalar;
    var temp = point;
    while (s != 0u) {
        if ((s & 1u) == 1u) {
            result = add_points_no_collision_f32(result, temp);
        }
        temp = double_point_f32(temp);
        s = s >> 1u;
    }
    return result;
}

fn load_bucket_sum_f32(idx: u32) -> PointF32 {
    var p: PointF32;
    p.x = bucket_sum_x[idx];
    p.y = bucket_sum_y[idx];
    p.z = bucket_sum_z[idx];
    return p;
}

fn load_g_point_f32(t: u32) -> PointF32 {
    var p: PointF32;
    p.x = g_points_x[t];
    p.y = g_points_y[t];
    p.z = g_points_z[t];
    return p;
}

@compute
@workgroup_size({{ workgroup_size }})
fn stage_1(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let thread_id = global_id.x;
    let num_threads_per_subtask = {{ workgroup_size }}u;

    let subtask_idx = params[0];
    let num_columns = params[1];
    let num_subtasks_per_bpr = params[2];

    let num_buckets_per_subtask = num_columns / 2u;
    let num_buckets_per_bpr = num_buckets_per_subtask * num_subtasks_per_bpr;
    let buckets_per_thread = num_buckets_per_subtask / num_threads_per_subtask;

    let multiplier = subtask_idx + (thread_id / num_threads_per_subtask);
    let offset = num_buckets_per_subtask * multiplier;

    var idx = offset;
    if (thread_id % num_threads_per_subtask != 0u) {
        idx = (num_threads_per_subtask - (thread_id % num_threads_per_subtask)) *
              buckets_per_thread + offset;
    }

    var m = load_bucket_sum_f32(idx);
    var g = m;

{{#assume_affine_buckets}}
    // Optimised path: every input bucket is either affine packaged into
    // Jacobian (Z = R_f) or identity (Z = 0). State flags m_is_zero /
    // m_eq_g guide safe accumulation without bigint_eq.
    var m_is_zero: bool = bigint_f32_is_zero(&m.z);
    var m_eq_g: bool = false;

    if (buckets_per_thread > 1u) {
        let idx0 = (num_threads_per_subtask - (thread_id % num_threads_per_subtask)) *
                   buckets_per_thread - 1u;
        var b0 = load_bucket_sum_f32(offset + idx0);
        if (bigint_f32_is_zero(&b0.z)) {
            if (!m_is_zero) {
                g = double_point_f32(m);
            }
        } else if (m_is_zero) {
            m = b0; g = b0; m_is_zero = false; m_eq_g = true;
        } else {
            m = add_points_mixed_no_collision_f32(m, b0);
            g = add_points_no_collision_f32(g, m);
        }
    }

    for (var i = 1u; i < buckets_per_thread - 1u; i++) {
        let idx_i = (num_threads_per_subtask - (thread_id % num_threads_per_subtask)) *
                    buckets_per_thread - 1u - i;
        var b = load_bucket_sum_f32(offset + idx_i);

        if (bigint_f32_is_zero(&b.z)) {
            if (m_is_zero) {
                // both identity, nothing to do
            } else if (m_eq_g) {
                g = double_point_f32(m);
                m_eq_g = false;
            } else {
                g = add_points_no_collision_f32(g, m);
            }
        } else {
            if (m_is_zero) {
                m = b; g = b; m_is_zero = false; m_eq_g = true;
            } else {
                m = add_points_mixed_no_collision_f32(m, b);
                g = add_points_no_collision_f32(g, m);
                m_eq_g = false;
            }
        }
    }
{{/assume_affine_buckets}}
{{^assume_affine_buckets}}
{{#mixed_safe_buckets}}
    // Mixed-add for m (inline formula), full safe add_points_f32 for g.
    // Mirror of the u32 path's mixed_safe branch — the inline formula
    // here keeps the Z3 computation right after H is born, same hot
    // path the u32 path's inline relies on.
    for (var i = 0u; i < buckets_per_thread - 1u; i++) {
        let idx = (num_threads_per_subtask - (thread_id % num_threads_per_subtask)) *
                  buckets_per_thread - 1u - i;
        let bi = offset + idx;
        var b = load_bucket_sum_f32(bi);

        if (!bigint_f32_is_zero(&b.z)) {
            if (bigint_f32_is_zero(&m.z)) {
                var r: BigIntF32;
{{{ r_limbs_f32 }}}
                m.x = b.x;
                m.y = b.y;
                m.z = r;
            } else {
                var X1: BigIntF32 = m.x; var Y1: BigIntF32 = m.y; var Z1: BigIntF32 = m.z;
                var X2: BigIntF32 = b.x; var Y2: BigIntF32 = b.y;

                var Z1Z1 = montgomery_product_f32(&Z1, &Z1);
                var U2 = montgomery_product_f32(&X2, &Z1Z1);
                var Y2Z1 = montgomery_product_f32(&Y2, &Z1);
                var S2 = montgomery_product_f32(&Y2Z1, &Z1Z1);

                var H = fr_sub_f32(&U2, &X1);
                var HH = montgomery_product_f32(&H, &H);

                var ZpH = fr_add_f32(&Z1, &H);
                var ZpH_sq = montgomery_product_f32(&ZpH, &ZpH);
                var Z3_local = fr_sub_f32(&ZpH_sq, &Z1Z1);
                Z3_local = fr_sub_f32(&Z3_local, &HH);

                var I = fr_add_f32(&HH, &HH);
                I = fr_add_f32(&I, &I);

                var J = montgomery_product_f32(&H, &I);

                var S2mY1 = fr_sub_f32(&S2, &Y1);
                var r_local = fr_add_f32(&S2mY1, &S2mY1);

                var V = montgomery_product_f32(&X1, &I);

                var r_sq = montgomery_product_f32(&r_local, &r_local);
                var twoV = fr_add_f32(&V, &V);
                var X3_local = fr_sub_f32(&r_sq, &J);
                X3_local = fr_sub_f32(&X3_local, &twoV);

                var VmX3 = fr_sub_f32(&V, &X3_local);
                var rVX = montgomery_product_f32(&r_local, &VmX3);
                var Y1J = montgomery_product_f32(&Y1, &J);
                var twoY1J = fr_add_f32(&Y1J, &Y1J);
                var Y3_local = fr_sub_f32(&rVX, &twoY1J);

                m.x = X3_local;
                m.y = Y3_local;
                m.z = Z3_local;
            }
        }
        g = add_points_f32(g, m);
    }
{{/mixed_safe_buckets}}
{{^mixed_safe_buckets}}
{{#safe_first_add_no_collision}}
    // Production path with `add_points_no_collision_f32` for the first add.
    // m is the running sum so far, b is a fresh bucket sum from a
    // distinct bucket — collisions are statistically impossible for SRS
    // bases (~2^-253). The second add (g = g + m) keeps full safe
    // add_points_f32: iter 0 has a genuine same-point case when b is
    // identity.
    for (var i = 0u; i < buckets_per_thread - 1u; i ++) {
        let idx = (num_threads_per_subtask - (thread_id % num_threads_per_subtask)) *
                  buckets_per_thread - 1u - i;
        let bi = offset + idx;
        let b = load_bucket_sum_f32(bi);
        m = add_points_no_collision_f32(m, b);
        g = add_points_f32(g, m);
    }
{{/safe_first_add_no_collision}}
{{^safe_first_add_no_collision}}
    // Legacy path: full safe add_points_f32 with collision check.
    for (var i = 0u; i < buckets_per_thread - 1u; i ++) {
        let idx = (num_threads_per_subtask - (thread_id % num_threads_per_subtask)) *
                  buckets_per_thread - 1u - i;
        let bi = offset + idx;
        let b = load_bucket_sum_f32(bi);
        m = add_points_f32(m, b);
        g = add_points_f32(g, m);
    }
{{/safe_first_add_no_collision}}
{{/mixed_safe_buckets}}
{{/assume_affine_buckets}}

    let t = (subtask_idx / num_subtasks_per_bpr) *
            (num_threads_per_subtask * num_subtasks_per_bpr) +
            thread_id;

    bucket_sum_x[idx] = m.x;
    bucket_sum_y[idx] = m.y;
    bucket_sum_z[idx] = m.z;

    g_points_x[t] = g.x;
    g_points_y[t] = g.y;
    g_points_z[t] = g.z;

    {{{ recompile }}}
}

@compute
@workgroup_size({{ workgroup_size }})
fn stage_2(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let thread_id = global_id.x;
    let num_threads_per_subtask = {{ workgroup_size }}u;

    let subtask_idx = params[0];
    let num_columns = params[1];
    let num_subtasks_per_bpr = params[2];

    let num_buckets_per_subtask = num_columns / 2u;
    let num_buckets_per_bpr = num_buckets_per_subtask * num_subtasks_per_bpr;
    let buckets_per_thread = num_buckets_per_subtask / num_threads_per_subtask;

    let multiplier = subtask_idx + (thread_id / num_threads_per_subtask);
    let offset = num_buckets_per_subtask * multiplier;

    var idx = offset;
    if (thread_id % num_threads_per_subtask != 0u) {
        idx = (num_threads_per_subtask - (thread_id % num_threads_per_subtask)) *
              buckets_per_thread + offset;
    }

    var m = load_bucket_sum_f32(idx);

    let t = (subtask_idx / num_subtasks_per_bpr) *
            (num_threads_per_subtask * num_subtasks_per_bpr) +
            thread_id;
    var g = load_g_point_f32(t);

    let s = buckets_per_thread * (num_threads_per_subtask - (thread_id % num_threads_per_subtask) - 1u);
    let sm: PointF32 = double_and_add_f32(m, s);

    var combined = add_points_f32(g, sm);

    g_points_x[t] = combined.x;
    g_points_y[t] = combined.y;
    g_points_z[t] = combined.z;

    {{{ recompile }}}
}
