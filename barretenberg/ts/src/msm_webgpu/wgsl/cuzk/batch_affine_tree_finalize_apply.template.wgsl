{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}

// Compacted Pass C for the tree-reduce merged finalize.
//
// Reads the per-subtask compaction count `case4_count[subtask_idx]`,
// early-returns for slots beyond the count, otherwise re-resolves p1/p2
// using the back-reference `case4_back_id[id4]` (same logic as
// batch_affine_tree_finalize), reads the inverse from
// case4_inv[id4] (computed by batch_inverse_parallel over the
// compacted slice), and finishes the affine add — writing the result
// into bucket_x/y/z[bi].

@group(0) @binding(0)
var<storage, read> running_x: array<BigInt>;
@group(0) @binding(1)
var<storage, read> running_y: array<BigInt>;
@group(0) @binding(2)
var<storage, read> bucket_active: array<u32>;
@group(0) @binding(3)
var<storage, read> case4_back_id: array<u32>;
@group(0) @binding(4)
var<storage, read> case4_inv: array<BigInt>;
@group(0) @binding(5)
var<storage, read> case4_count: array<u32>;

@group(0) @binding(6)
var<storage, read_write> bucket_x: array<BigInt>;
@group(0) @binding(7)
var<storage, read_write> bucket_y: array<BigInt>;
@group(0) @binding(8)
var<storage, read_write> bucket_z: array<BigInt>;

@group(0) @binding(9)
var<uniform> params: vec4<u32>;
// params[0] = num_y_workgroups
// params[1] = num_z_workgroups
// params[2] = subtask_offset
// params[3] = workspace_stride

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

fn neg_y(running_idx: u32) -> BigInt {
    var p_mod = get_p();
    var y = running_y[running_idx];
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
    let lane = (gidx * num_y_workgroups + gidy) * num_z_workgroups + gidz;

    let num_columns = {{ num_columns }}u;
    let h = {{ half_num_columns }}u;

    let subtask_idx = lane / h;
    let slot = lane % h;
    let count = case4_count[subtask_idx];
    if (slot >= count) {
        return;
    }

    let id4 = subtask_idx * h + slot;
    let id = case4_back_id[id4];

    // Slot-to-bucket mapping mirrors batch_affine_tree_finalize:
    //   subtask_idx = id / h
    //   bi          = id + subtask_offset * h
    let bi = id + subtask_offset * h;
    let workspace_offset = (subtask_idx + subtask_offset) * workspace_stride;

    // ---- Re-resolve j = 0 side ----
    var p1_x: BigInt;
    var p1_y: BigInt;
    {
        var row_idx = (id % h) + h;
        if (id % h == 0u) {
            row_idx = 0u;
        }

        var negate: bool = false;
        if (h > row_idx) {
            negate = true;
        }

        let workspace_idx = workspace_offset + row_idx;
        p1_x = running_x[workspace_idx];
        if (negate) {
            p1_y = neg_y(workspace_idx);
        } else {
            p1_y = running_y[workspace_idx];
        }
    }

    // ---- Re-resolve j = 1 side ----
    var p2_x: BigInt;
    var p2_y: BigInt;
    {
        let row_idx = h - (id % h);
        var negate: bool = false;
        if (h > row_idx) {
            negate = true;
        }

        let workspace_idx = workspace_offset + row_idx;
        p2_x = running_x[workspace_idx];
        if (negate) {
            p2_y = neg_y(workspace_idx);
        } else {
            p2_y = running_y[workspace_idx];
        }
    }

    var inv_d: BigInt = case4_inv[id4];

    var dy = fr_sub(&p2_y, &p1_y);
    var lambda = montgomery_product(&dy, &inv_d);

    var lambda_sq = montgomery_product(&lambda, &lambda);
    var t1 = fr_sub(&lambda_sq, &p1_x);
    var r_x = fr_sub(&t1, &p2_x);

    var dx_back = fr_sub(&p1_x, &r_x);
    var ldx = montgomery_product(&lambda, &dx_back);
    var r_y = fr_sub(&ldx, &p1_y);

    bucket_x[bi] = r_x;
    bucket_y[bi] = r_y;
    bucket_z[bi] = get_r();

    {{{ recompile }}}
}
