{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}

// Pass B of the two-pass batch-affine finalize.
//
// Re-resolves p1 and p2 for each bucket index `bi` (same logic as Pass A
// — collect). For threads that fell into cases 1-3 (identity / one side
// only), Pass A already wrote the bucket; this pass returns. For
// case 4 (both active), reads inv_delta from `pair_inv[id]` (computed
// by the batch_inverse pass between Pass A and Pass B) and finishes the
// affine add:
//
//   λ     = (p2.y - p1.y) * inv_delta
//   R.x   = λ² - p1.x - p2.x
//   R.y   = λ * (p1.x - R.x) - p1.y
//
// Output (bucket_x/y/z) is bit-identical to what the previous monolithic
// finalize kernel produced for the case-4 lane — same operand order in
// fr_sub / montgomery_product, same write order. So downstream BPR is
// unaffected.

{{#packed}}
@group(0) @binding(0)
var<storage, read> running_x: array<vec4<u32>>;
@group(0) @binding(1)
var<storage, read> running_y: array<vec4<u32>>;
@group(0) @binding(2)
var<storage, read> bucket_active: array<u32>;
@group(0) @binding(3)
var<storage, read> pair_inv: array<BigInt>;

@group(0) @binding(4)
var<storage, read_write> bucket_x: array<vec4<u32>>;
@group(0) @binding(5)
var<storage, read_write> bucket_y: array<vec4<u32>>;
@group(0) @binding(6)
var<storage, read_write> bucket_z: array<vec4<u32>>;
{{/packed}}
{{^packed}}
@group(0) @binding(0)
var<storage, read> running_x: array<BigInt>;
@group(0) @binding(1)
var<storage, read> running_y: array<BigInt>;
@group(0) @binding(2)
var<storage, read> bucket_active: array<u32>;
@group(0) @binding(3)
var<storage, read> pair_inv: array<BigInt>;

@group(0) @binding(4)
var<storage, read_write> bucket_x: array<BigInt>;
@group(0) @binding(5)
var<storage, read_write> bucket_y: array<BigInt>;
@group(0) @binding(6)
var<storage, read_write> bucket_z: array<BigInt>;
{{/packed}}

@group(0) @binding(7)
var<uniform> params: vec4<u32>;
// params[0] = num_y_workgroups
// params[1] = num_z_workgroups
// params[2] = subtask_offset
// params[3] = workspace_stride

{{#packed}}
{{{ dec_unpack }}}

{{{ dec_pack }}}

fn load_packed_ro(base_elem: u32, src: ptr<storage, array<vec4<u32>>, read>) -> BigInt {
    var w: array<u32, 8>;
    let q0 = (*src)[2u * base_elem];
    let q1 = (*src)[2u * base_elem + 1u];
    w[0] = q0.x; w[1] = q0.y; w[2] = q0.z; w[3] = q0.w;
    w[4] = q1.x; w[5] = q1.y; w[6] = q1.z; w[7] = q1.w;
    return unpack256_to_limbs(w);
}

fn store_packed_rw(base_elem: u32, dst: ptr<storage, array<vec4<u32>>, read_write>, val: ptr<function, BigInt>) {
    let w = pack_limbs_to_256(val);
    (*dst)[2u * base_elem] = vec4<u32>(w[0], w[1], w[2], w[3]);
    (*dst)[2u * base_elem + 1u] = vec4<u32>(w[4], w[5], w[6], w[7]);
}
{{/packed}}

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

fn neg_y(running_idx: u32) -> BigInt {
    var p_mod = get_p();
{{#packed}}
    var y = load_packed_ro(running_idx, &running_y);
{{/packed}}
{{^packed}}
    var y = running_y[running_idx];
{{/packed}}
    var ny: BigInt;
    let _b = bigint_sub(&p_mod, &y, &ny);
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

    // ---- Resolve j = 0 side ----
    var p1_x: BigInt;
    var p1_y: BigInt;
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
{{#packed}}
                p1_x = load_packed_ro(workspace_idx, &running_x);
{{/packed}}
{{^packed}}
                p1_x = running_x[workspace_idx];
{{/packed}}
                if (negate) {
                    p1_y = neg_y(workspace_idx);
                } else {
{{#packed}}
                    p1_y = load_packed_ro(workspace_idx, &running_y);
{{/packed}}
{{^packed}}
                    p1_y = running_y[workspace_idx];
{{/packed}}
                }
                p1_active = true;
            }
        }
    }

    // ---- Resolve j = 1 side ----
    var p2_x: BigInt;
    var p2_y: BigInt;
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
{{#packed}}
                p2_x = load_packed_ro(workspace_idx, &running_x);
{{/packed}}
{{^packed}}
                p2_x = running_x[workspace_idx];
{{/packed}}
                if (negate) {
                    p2_y = neg_y(workspace_idx);
                } else {
{{#packed}}
                    p2_y = load_packed_ro(workspace_idx, &running_y);
{{/packed}}
{{^packed}}
                    p2_y = running_y[workspace_idx];
{{/packed}}
                }
                p2_active = true;
            }
        }
    }

    // Cases 1-3 already written by collect — early return.
    if (!p1_active || !p2_active) {
        return;
    }

    // Case 4: both active. Use the precomputed inverse.
    var inv_d: BigInt = pair_inv[id];

    var dy = fr_sub(&p2_y, &p1_y);
    var lambda = montgomery_product(&dy, &inv_d);

    var lambda_sq = montgomery_product(&lambda, &lambda);
    var t1 = fr_sub(&lambda_sq, &p1_x);
    var r_x = fr_sub(&t1, &p2_x);

    var dx_back = fr_sub(&p1_x, &r_x);
    var ldx = montgomery_product(&lambda, &dx_back);
    var r_y = fr_sub(&ldx, &p1_y);

    var r_z = get_r();
{{#packed}}
    store_packed_rw(bi, &bucket_x, &r_x);
    store_packed_rw(bi, &bucket_y, &r_y);
    store_packed_rw(bi, &bucket_z, &r_z);
{{/packed}}
{{^packed}}
    bucket_x[bi] = r_x;
    bucket_y[bi] = r_y;
    bucket_z[bi] = r_z;
{{/packed}}

    {{{ recompile }}}
}
