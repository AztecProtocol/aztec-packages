{{> structs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> bigint_funcs }}
{{> ec_funcs }}
{{> fr_pow_funcs }}

// Finalize kernel for the batch-affine SMVP pipeline.
//
// AFFINE FOLD VARIANT. Earlier versions of this kernel did the j=0 / j=1
// combine in Jacobian via add_points (function call) and the inlined
// add-2007-bl formula with Z3 hoisted up. Both paths produced
// bucket_y[i] == 0 (or bucket_z[i] == 0 in the function-call variant)
// on Dawn/Metal — Tint's register allocator was reusing BigInt slots
// across the long sequence of locals in the Jacobian formula, killing
// whichever output coordinate happened to be last.
//
// The OLD strategy of inlining + early Z3 worked for BPR stage_2 but
// broke when applied here. Repeated workarounds (storage-direct writes,
// outer X3_out/Y3_out/Z3_out, restructured branching) all produced the
// same all-zero Y output. CPU pipeline simulator confirmed the algorithm
// is correct, so the issue is purely Dawn/Tint register-allocation
// fragility specific to this call site.
//
// This rewrite SIDESTEPS the Jacobian formula entirely by performing
// the j=0/j=1 add in pure affine — the two operands are already affine
// (Z=R is the implicit Montgomery-1 packaging; geometrically (X, Y)).
// Each thread does one fr_inv (~500 montgomery_products) — pricey, but
// uses only the same primitives (fr_sub, montgomery_product) that
// batch_affine_apply uses successfully. ~16 M mont_prod total at
// h=32768; profiled cost will be ~100-300 ms on M-series silicon.
// Optimisation note: a future pass can replace the per-thread fr_inv
// with a batch_inverse over all delta_x's, cutting cost to ~3*N + 1
// montgomery_products. But correctness first.
//
// Outputs Jacobian-with-Z=R so downstream BPR sees the same layout the
// legacy SMVP produces.
//
//   - Two row-indices per thread (j = 0 and j = 1).
//   - For row_idx > h: the recovered bucket_idx is positive (row_idx - h).
//   - For row_idx < h: bucket_idx = h - row_idx, and the sum is negated.
//   - For row_idx == h: bucket_idx = 0 — bucket has no contribution; skip.
//   - For row_idx == 0 (only j=0 when id%h == 0): bucket_idx = h.

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

// Negate Y in field: returns p - y (assumes 0 <= y < p, which fr_sub
// outputs guarantee).
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

    // ---- Combine and write directly to storage ----
    //
    // Cases:
    //   - !p1_active && !p2_active: bucket is identity (X=0, Y=R, Z=0).
    //   - p1_active xor p2_active: result = (Xa, Ya, R) for the active side.
    //   - both active: pure affine add.
    //
    // Storage default-zero-init: when we write nothing, the slot stays 0.
    // For the identity case we still set y = R explicitly so downstream
    // is_zero(z) checks see (X=0, Y=R, Z=0) which all Jacobian primitives
    // treat as point-at-infinity.

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

    // Both active. Affine add.
    //   delta = X2 - X1
    //   λ     = (Y2 - Y1) * delta^{-1}
    //   R.x   = λ² - X1 - X2
    //   R.y   = λ * (X1 - R.x) - Y1
    //
    // SRS-backed bases — collision (delta == 0) is statistically
    // impossible. A future hardening pass can detect and route through
    // double_point if needed.
    var delta = fr_sub(&p2_x, &p1_x);
    var inv_d = fr_inv(delta);

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
