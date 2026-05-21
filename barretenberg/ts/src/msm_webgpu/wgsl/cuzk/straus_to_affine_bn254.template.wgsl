// Final Jacobian → affine conversion for the straus_msm WebGPU port.
//
// Reads `part_{x,y,z}[0]` (the single Jacobian point produced after the
// combine tree-fold has collapsed T partials to 1) and writes
// `result_{x,y}[0]` = `(part.x · z_inv², part.y · z_inv³)` as the affine
// coordinates. One thread; one Bernstein-Yang inverse.
//
// Outputs are still in Montgomery form (caller de-Monts on readback).
// If the input Jacobian Z is zero (identity), the result fields are
// left zero so the host driver can interpret the readback as ∞.

{{> structs }}
{{> bigint_funcs }}
{{> field_funcs }}
{{> montgomery_product_funcs }}
{{> ec_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> by_inverse_a_funcs }}

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

@group(0) @binding(0) var<storage, read>       part_x:    array<BigInt>;
@group(0) @binding(1) var<storage, read>       part_y:    array<BigInt>;
@group(0) @binding(2) var<storage, read>       part_z:    array<BigInt>;
@group(0) @binding(3) var<storage, read_write> result_xy: array<BigInt>;

@compute
@workgroup_size(1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    if (gid.x != 0u) { return; }

    var z: BigInt = part_z[0];
    if (is_zero(z)) {
        var zero: BigInt;
        result_xy[0] = zero;
        result_xy[1] = zero;
        return;
    }

    var x_in: BigInt = part_x[0];
    var y_in: BigInt = part_y[0];
    var z_inv: BigInt = fr_inv_by_a(z);
    var z_inv_sq: BigInt = montgomery_product(&z_inv, &z_inv);
    var z_inv_cu: BigInt = montgomery_product(&z_inv_sq, &z_inv);
    var x_aff: BigInt = montgomery_product(&x_in, &z_inv_sq);
    var y_aff: BigInt = montgomery_product(&y_in, &z_inv_cu);
    result_xy[0] = x_aff;
    result_xy[1] = y_aff;

    {{{ recompile }}}
}
