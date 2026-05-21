{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> inverse_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

// Window combine — the final Pippenger step, on-GPU.
//
// The bucket reduction leaves a per-window weighted sum L_w in red_buf at
// slot w*STRIDE. This kernel folds them into the single MSM result
//   R = sum_{w=0..NW-1} L_w * 2^(w*c)
// and converts it to an affine point — so the GPU emits one point and the
// host wrapper does no elliptic-curve work.
//
// One dispatch, one workgroup. The fold runs in Jacobian coordinates (a=0)
// so it is inversion-free; a single inverse at the end returns affine. It is
// a binary tree: each level combines pairs, the high half shifted by `shift`
// doublings (c, 2c, 4c, ...). The tree's latency is the irreducible
// ~(NW-1)*c doubling chain — the top window must be doubled to its weight —
// the tree only removes the serial adds a Horner fold would do. NW is small,
// so the whole fold fits one workgroup with the points in shared memory.

const PG: u32 = 2u;
const NW: u32 = {{ num_windows }}u; // number of windows
const CBITS: u32 = {{ c }}u; // window bit-width

@group(0) @binding(0) var<storage, read> red_buf: array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> out_pt: array<vec4<u32>>;
@group(0) @binding(2) var<uniform> params: vec4<u32>;
// params.x = STRIDE   params.y = M (red_buf element stride = NW*STRIDE)

// Jacobian point, Montgomery-form coordinates.
struct Jac {
    x: BigInt,
    y: BigInt,
    z: BigInt,
}

var<workgroup> wp: array<Jac, NW>;

fn load_x(idx: u32) -> BigInt {
    let base = PG * idx;
    let q0 = red_buf[base + 0u];
    let q1 = red_buf[base + 1u];
    var w: array<u32, 8>;
    w[0] = q0.x; w[1] = q0.y; w[2] = q0.z; w[3] = q0.w;
    w[4] = q1.x; w[5] = q1.y; w[6] = q1.z; w[7] = q1.w;
    return unpack256_to_limbs(w);
}

fn load_y(idx: u32, M: u32) -> BigInt {
    let base = PG * M + PG * idx;
    let q0 = red_buf[base + 0u];
    let q1 = red_buf[base + 1u];
    var w: array<u32, 8>;
    w[0] = q0.x; w[1] = q0.y; w[2] = q0.z; w[3] = q0.w;
    w[4] = q1.x; w[5] = q1.y; w[6] = q1.z; w[7] = q1.w;
    return unpack256_to_limbs(w);
}

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

fn get_one() -> BigInt {
    var w: array<u32, 8>;
    w[0] = 1u; w[1] = 0u; w[2] = 0u; w[3] = 0u;
    w[4] = 0u; w[5] = 0u; w[6] = 0u; w[7] = 0u;
    return unpack256_to_limbs(w);
}

// Jacobian doubling, a = 0 (EFD dbl-2009-l).
fn jac_double(P: Jac) -> Jac {
    var X = P.x;
    var Y = P.y;
    var Z = P.z;
    var A = montgomery_product(&X, &X);
    var B = montgomery_product(&Y, &Y);
    var C = montgomery_product(&B, &B);
    var xB = fr_add(&X, &B);
    var xB2 = montgomery_product(&xB, &xB);
    var AC = fr_add(&A, &C);
    var s = fr_sub(&xB2, &AC);
    var D = fr_add(&s, &s);
    var A2 = fr_add(&A, &A);
    var E = fr_add(&A2, &A);
    var F = montgomery_product(&E, &E);
    var D2 = fr_add(&D, &D);
    var C2 = fr_add(&C, &C);
    var C4 = fr_add(&C2, &C2);
    var C8 = fr_add(&C4, &C4);
    var yz = montgomery_product(&Y, &Z);
    var R: Jac;
    R.x = fr_sub(&F, &D2);
    var dX3 = fr_sub(&D, &R.x);
    var eDX3 = montgomery_product(&E, &dX3);
    R.y = fr_sub(&eDX3, &C8);
    R.z = fr_add(&yz, &yz);
    return R;
}

// Jacobian + Jacobian addition, a = 0 (EFD add-2007-bl). Assumes neither
// operand is the point at infinity and P != +-Q (true for independent
// window sums with overwhelming probability).
fn jac_add(P: Jac, Q: Jac) -> Jac {
    var X1 = P.x; var Y1 = P.y; var Z1 = P.z;
    var X2 = Q.x; var Y2 = Q.y; var Z2 = Q.z;
    var Z1Z1 = montgomery_product(&Z1, &Z1);
    var Z2Z2 = montgomery_product(&Z2, &Z2);
    var U1 = montgomery_product(&X1, &Z2Z2);
    var U2 = montgomery_product(&X2, &Z1Z1);
    var z2c = montgomery_product(&Z2, &Z2Z2);
    var S1 = montgomery_product(&Y1, &z2c);
    var z1c = montgomery_product(&Z1, &Z1Z1);
    var S2 = montgomery_product(&Y2, &z1c);
    var H = fr_sub(&U2, &U1);
    var H2 = fr_add(&H, &H);
    var I = montgomery_product(&H2, &H2);
    var J = montgomery_product(&H, &I);
    var sd = fr_sub(&S2, &S1);
    var r = fr_add(&sd, &sd);
    var V = montgomery_product(&U1, &I);
    var r2 = montgomery_product(&r, &r);
    var V2 = fr_add(&V, &V);
    var R: Jac;
    var jv2 = fr_add(&J, &V2);
    R.x = fr_sub(&r2, &jv2);
    var vX3 = fr_sub(&V, &R.x);
    var rVX3 = montgomery_product(&r, &vX3);
    var s1j = montgomery_product(&S1, &J);
    var s1j2 = fr_add(&s1j, &s1j);
    R.y = fr_sub(&rVX3, &s1j2);
    var z1z2 = fr_add(&Z1, &Z2);
    var z1z2s = montgomery_product(&z1z2, &z1z2);
    var zz = fr_add(&Z1Z1, &Z2Z2);
    var t = fr_sub(&z1z2s, &zz);
    R.z = montgomery_product(&t, &H);
    return R;
}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(local_invocation_id) lid: vec3<u32>) {
    let tid = lid.x;
    let stride = params.x;
    let M = params.y;

    // Load each window sum L_w as a Jacobian point (Z = 1, Montgomery = R).
    if (tid < NW) {
        var p: Jac;
        p.x = load_x(tid * stride);
        p.y = load_y(tid * stride, M);
        p.z = get_r();
        wp[tid] = p;
    }
    workgroupBarrier();

    // Tree fold: combine pairs, the high half doubled `shift` times.
    var n: u32 = NW;
    var shift: u32 = CBITS;
    while (n > 1u) {
        let half = (n + 1u) / 2u;
        let is_active = tid < half;
        var result: Jac;
        if (is_active) {
            let lo = 2u * tid;
            let hi = 2u * tid + 1u;
            if (hi < n) {
                var p = wp[hi];
                for (var d: u32 = 0u; d < shift; d = d + 1u) {
                    p = jac_double(p);
                }
                result = jac_add(p, wp[lo]);
            } else {
                result = wp[lo];
            }
        }
        workgroupBarrier();
        if (is_active) {
            wp[tid] = result;
        }
        workgroupBarrier();
        n = half;
        shift = shift * 2u;
    }

    // wp[0] is R in Jacobian; one inverse converts to affine, then a
    // montmul by 1 strips the Montgomery factor so the host reads it raw.
    if (tid == 0u) {
        var Z = wp[0].z;
        var zinv: BigInt = {{ inv_fn }}(Z);
        var zinv2 = montgomery_product(&zinv, &zinv);
        var zinv3 = montgomery_product(&zinv2, &zinv);
        var X = wp[0].x;
        var Y = wp[0].y;
        var xm = montgomery_product(&X, &zinv2);
        var ym = montgomery_product(&Y, &zinv3);
        var one = get_one();
        var xr = montgomery_product(&xm, &one);
        var yr = montgomery_product(&ym, &one);
        let wx = pack_limbs_to_256(&xr);
        let wy = pack_limbs_to_256(&yr);
        out_pt[0] = vec4<u32>(wx[0], wx[1], wx[2], wx[3]);
        out_pt[1] = vec4<u32>(wx[4], wx[5], wx[6], wx[7]);
        out_pt[2] = vec4<u32>(wy[0], wy[1], wy[2], wy[3]);
        out_pt[3] = vec4<u32>(wy[4], wy[5], wy[6], wy[7]);
    }

    {{{ recompile }}}
}
