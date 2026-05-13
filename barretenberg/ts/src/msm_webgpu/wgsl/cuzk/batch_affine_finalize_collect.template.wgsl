{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}

// Pass A of the two-pass batch-affine finalize.
//
// Resolves the j=0 (p1) and j=1 (p2) sides for each bucket index `bi`,
// determines the case, and either:
//   - Writes the bucket directly (cases 1-3: identity / one side only),
//     storing R (Montgomery 1) as a placeholder in pair_delta[id] so the
//     downstream batch_inverse treats this slot as a no-op.
//   - Computes delta = p2.x - p1.x and writes to pair_delta[id]
//     (case 4: both active), leaving the bucket untouched. The
//     downstream Pass B reads inv_delta[id] and finishes the affine add.
//
// The previous monolithic finalize kernel called `fr_inv` per thread
// (~520 montgomery_products) — at T*h ≈ 524k threads the pass cost ~150 ms
// of GPU time. Splitting into collect → batch_inverse → apply trades
// the per-thread fr_inv for one shared inversion, dropping the cost to
// ~30 ms.
//
// `R` placeholder rationale: writing R for non-case-4 slots makes the
// batch_inverse prefix product cleanly include them as identity multiplies
// (R * x = x in Montgomery form). The Pass B re-resolves the case and
// only consumes inv_delta when bot sides are active, so the placeholder
// inverse value is never used.

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
var<storage, read_write> pair_delta: array<BigInt>;

@group(0) @binding(7)
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

// Field negation in canonical form: returns (p - y) mod p. fr_sub
// outputs guarantee 0 <= y < p so this is safe.
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
        pair_delta[id] = get_r(); // placeholder — never consumed.
        return;
    }

    if (!p2_active) {
        bucket_x[bi] = p1_x;
        bucket_y[bi] = p1_y;
        bucket_z[bi] = get_r();
        pair_delta[id] = get_r();
        return;
    }

    if (!p1_active) {
        bucket_x[bi] = p2_x;
        bucket_y[bi] = p2_y;
        bucket_z[bi] = get_r();
        pair_delta[id] = get_r();
        return;
    }

    // Both active: emit delta. Bucket left untouched (Pass B will write).
    var delta = fr_sub(&p2_x, &p1_x);
    pair_delta[id] = delta;

    {{{ recompile }}}
}
