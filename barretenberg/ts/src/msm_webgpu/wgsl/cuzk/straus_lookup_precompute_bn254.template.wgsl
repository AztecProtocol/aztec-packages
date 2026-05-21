// straus_msm lookup-precompute kernel for BN254 G1.
//
// Given an affine SRS prefix `base_{x,y}` of length N (Montgomery limbs),
// builds the 8·N Jacobian lookup table `lut_{x,y,z}` where
//
//     lut[i*8 + k] = (k+1) · base[i]   for k ∈ [0, 8).
//
// One thread per active point. The k=0 entry is the point itself with
// Z = MONT_ONE; the chained adds use `add_points_mixed(cur, pt)` where
// `pt` is the affine base (Z = MONT_ONE so the mixed-add formula is
// valid). The first chained call is the P+P collision case — handled
// by `add_points_mixed`'s built-in doubling fallback.

{{> structs }}
{{> bigint_funcs }}
{{> field_funcs }}
{{> montgomery_product_funcs }}
{{> ec_funcs }}

const N: u32 = {{ n }}u;
const LOOKUP_SIZE: u32 = 8u;
const STRIDE: u32      = 16u;

@group(0) @binding(0) var<storage, read>       base_x: array<BigInt>;
@group(0) @binding(1) var<storage, read>       base_y: array<BigInt>;
@group(0) @binding(2) var<storage, read_write> lut_x:  array<BigInt>;
@group(0) @binding(3) var<storage, read_write> lut_y:  array<BigInt>;
@group(0) @binding(4) var<storage, read_write> lut_z:  array<BigInt>;

fn get_mont_one() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

fn get_beta_mont() -> BigInt {
    var b: BigInt;
{{{ beta_mont_limbs }}}
    return b;
}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= N) { return; }

    var pt: Point;
    pt.x = base_x[i];
    pt.y = base_y[i];
    pt.z = get_mont_one();

    // Layout: lut[i*16 + h*8 + k] stores (k+1)·P_i for h=0, and the
    // φ-image (β·X, Y, Z) of the same Jacobian point for h=1. h=1 is
    // straus_main's k2·φ(P) half: writing the β-scaled X here once
    // amortises the runtime β-mul across every (window, ii) iteration.
    var beta: BigInt = get_beta_mont();
    var cur: Point = pt;
    let base_off: u32 = i * STRIDE;

    var x0: BigInt = cur.x;
    var beta_v: BigInt = beta;
    var beta_x0: BigInt = montgomery_product(&x0, &beta_v);
    lut_x[base_off + 0u] = cur.x;
    lut_y[base_off + 0u] = cur.y;
    lut_z[base_off + 0u] = cur.z;
    lut_x[base_off + LOOKUP_SIZE + 0u] = beta_x0;
    lut_y[base_off + LOOKUP_SIZE + 0u] = cur.y;
    lut_z[base_off + LOOKUP_SIZE + 0u] = cur.z;

    for (var kk: u32 = 1u; kk < LOOKUP_SIZE; kk = kk + 1u) {
        cur = add_points_mixed(cur, pt);
        var xk: BigInt = cur.x;
        var beta_xk: BigInt = montgomery_product(&xk, &beta_v);
        lut_x[base_off + kk] = cur.x;
        lut_y[base_off + kk] = cur.y;
        lut_z[base_off + kk] = cur.z;
        lut_x[base_off + LOOKUP_SIZE + kk] = beta_xk;
        lut_y[base_off + LOOKUP_SIZE + kk] = cur.y;
        lut_z[base_off + LOOKUP_SIZE + kk] = cur.z;
    }

    {{{ recompile }}}
}
