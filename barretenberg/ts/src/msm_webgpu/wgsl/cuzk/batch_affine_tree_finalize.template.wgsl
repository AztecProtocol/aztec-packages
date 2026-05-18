{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}

// Merged finalize for the tree-reduce SMVP path.
//
// Replaces three dispatches (finalize_collect + finalize_inverse +
// finalize_apply) with one merged kernel + a much smaller batch inverse
// + a compacted apply. Each thread covers one bucket pair (same T*h
// geometry as legacy finalize_collect). For cases 1-3 (at least one
// side inactive) the Jacobian result is written directly to
// bucket_x/y/z[bi]; for case 4 (both active) the delta is compacted
// into a per-subtask slot (atomicAdd on case4_count[subtask_idx]) along
// with the back-reference `id`, leaving the bucket untouched for the
// downstream apply pass to fill in.
//
// At logN=16 this drops the batch-inverse prefix product from T*h
// (~524K) slots to ~0.4% of that (~1900 case-4 slots per subtask).

@group(0) @binding(0)
var<storage, read> running_x: array<BigInt>;
@group(0) @binding(1)
var<storage, read> running_y: array<BigInt>;
@group(0) @binding(2)
var<storage, read> bucket_active: array<u32>;

@group(0) @binding(3)
var<storage, read_write> bucket_x: array<BigInt>;
@group(0) @binding(4)
var<storage, read_write> bucket_y: array<BigInt>;
@group(0) @binding(5)
var<storage, read_write> bucket_z: array<BigInt>;

@group(0) @binding(6)
var<storage, read_write> case4_delta: array<BigInt>;
@group(0) @binding(7)
var<storage, read_write> case4_back_id: array<u32>;
@group(0) @binding(8)
var<storage, read_write> case4_count: array<atomic<u32>>;

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
    let id = (gidx * num_y_workgroups + gidy) * num_z_workgroups + gidz;

    let num_columns = {{ num_columns }}u;
    let h = {{ half_num_columns }}u;

    let subtask_idx = id / h;
    let bi = id + subtask_offset * h;
    let workspace_offset = (subtask_idx + subtask_offset) * workspace_stride;

    // ---- Resolve j = 0 side as affine (X1, Y1) + active flag ----
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
                p1_x = running_x[workspace_idx];
                if (negate) {
                    p1_y = neg_y(workspace_idx);
                } else {
                    p1_y = running_y[workspace_idx];
                }
                p1_active = true;
            }
        }
    }

    // ---- Resolve j = 1 side as affine (X2, Y2) + active flag ----
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
                p2_x = running_x[workspace_idx];
                if (negate) {
                    p2_y = neg_y(workspace_idx);
                } else {
                    p2_y = running_y[workspace_idx];
                }
                p2_active = true;
            }
        }
    }

    // ---- Cases ----
    if (!p1_active && !p2_active) {
        var zero: BigInt;
        bucket_x[bi] = zero;
        bucket_y[bi] = get_r();
        bucket_z[bi] = zero;
        return;
    }

    if (!p2_active) {
        bucket_x[bi] = p1_x;
        bucket_y[bi] = p1_y;
        bucket_z[bi] = get_r();
        return;
    }

    if (!p1_active) {
        bucket_x[bi] = p2_x;
        bucket_y[bi] = p2_y;
        bucket_z[bi] = get_r();
        return;
    }

    // Both active: compact for downstream batch inverse + apply.
    let slot = atomicAdd(&case4_count[subtask_idx], 1u);
    let id4 = subtask_idx * h + slot;
    var delta = fr_sub(&p2_x, &p1_x);
    case4_delta[id4] = delta;
    case4_back_id[id4] = id;

    {{{ recompile }}}
}
