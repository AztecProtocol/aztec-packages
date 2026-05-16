// 23-bit f32 mirror of `batch_affine_finalize.template.wgsl`.
// Affine fold variant — one per-thread fr_inv. Outputs Jacobian with
// Z = R (Montgomery 1) so the downstream BPR f32 path sees the same
// layout the legacy SMVP f32 produces.

@group(0) @binding(0)
var<storage, read> running_x: array<BigIntF32>;
@group(0) @binding(1)
var<storage, read> running_y: array<BigIntF32>;
@group(0) @binding(2)
var<storage, read> bucket_active: array<u32>;

@group(0) @binding(3)
var<storage, read_write> bucket_x: array<BigIntF32>;
@group(0) @binding(4)
var<storage, read_write> bucket_y: array<BigIntF32>;
@group(0) @binding(5)
var<storage, read_write> bucket_z: array<BigIntF32>;

@group(0) @binding(6)
var<uniform> params: vec4<u32>;

fn get_r_local_f32() -> BigIntF32 {
    var r: BigIntF32;
{{{ r_limbs_f32 }}}
    return r;
}

fn neg_y_local(running_idx: u32) -> BigIntF32 {
    var p_mod = get_p_f32();
    var y = running_y[running_idx];
    var ny: BigIntF32;
    let _b = bigint_f32_sub(&p_mod, &y, &ny);
    return ny;
}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let num_y_workgroups = params[0];
    let num_z_workgroups = params[1];
    let subtask_offset = params[2];
    let workspace_stride = params[3];

    let gidx = global_id.x;
    let gidy = global_id.y;
    var gidz = global_id.z;
    let id = (gidx * num_y_workgroups + gidy) * num_z_workgroups + gidz;

    let num_columns = {{ num_columns }}u;
    let h = {{ half_num_columns }}u;

    let subtask_idx = id / h;
    let bi = id + subtask_offset * h;
    let workspace_offset = (subtask_idx + subtask_offset) * workspace_stride;

    var p1_x: BigIntF32;
    var p1_y: BigIntF32;
    var p1_active: bool = false;
    {
        var row_idx = (id % h) + h;
        if (id % h == 0u) {
            row_idx = 0u;
        }

        var bucket_idx: u32 = 0u;
        var negate: bool = false;
        if (h > row_idx) {
            bucket_idx = h - row_idx;
            negate = true;
        } else {
            bucket_idx = row_idx - h;
        }

        if (bucket_idx > 0u) {
            let workspace_idx = workspace_offset + row_idx;
            if (bucket_active[workspace_idx] != 0u) {
                p1_x = running_x[workspace_idx];
                if (negate) {
                    p1_y = neg_y_local(workspace_idx);
                } else {
                    p1_y = running_y[workspace_idx];
                }
                p1_active = true;
            }
        }
    }

    var p2_x: BigIntF32;
    var p2_y: BigIntF32;
    var p2_active: bool = false;
    {
        let row_idx = h - (id % h);
        var bucket_idx: u32 = 0u;
        var negate: bool = false;
        if (h > row_idx) {
            bucket_idx = h - row_idx;
            negate = true;
        } else {
            bucket_idx = row_idx - h;
        }

        if (bucket_idx > 0u) {
            let workspace_idx = workspace_offset + row_idx;
            if (bucket_active[workspace_idx] != 0u) {
                p2_x = running_x[workspace_idx];
                if (negate) {
                    p2_y = neg_y_local(workspace_idx);
                } else {
                    p2_y = running_y[workspace_idx];
                }
                p2_active = true;
            }
        }
    }

    if (!p1_active && !p2_active) {
        var zero: BigIntF32;
        bucket_x[bi] = zero;
        bucket_y[bi] = get_r_local_f32();
        bucket_z[bi] = zero;
        return;
    }

    if (!p2_active) {
        bucket_x[bi] = p1_x;
        bucket_y[bi] = p1_y;
        bucket_z[bi] = get_r_local_f32();
        return;
    }

    if (!p1_active) {
        bucket_x[bi] = p2_x;
        bucket_y[bi] = p2_y;
        bucket_z[bi] = get_r_local_f32();
        return;
    }

    var delta = fr_sub_f32(&p2_x, &p1_x);
    var inv_d = fr_inv_f32(delta);

    var dy = fr_sub_f32(&p2_y, &p1_y);
    var lambda = montgomery_product_f32(&dy, &inv_d);

    var lambda_sq = montgomery_product_f32(&lambda, &lambda);
    var t1 = fr_sub_f32(&lambda_sq, &p1_x);
    var r_x = fr_sub_f32(&t1, &p2_x);

    var dx_back = fr_sub_f32(&p1_x, &r_x);
    var ldx = montgomery_product_f32(&lambda, &dx_back);
    var r_y = fr_sub_f32(&ldx, &p1_y);

    bucket_x[bi] = r_x;
    bucket_y[bi] = r_y;
    bucket_z[bi] = get_r_local_f32();

    {{{ recompile }}}
}
