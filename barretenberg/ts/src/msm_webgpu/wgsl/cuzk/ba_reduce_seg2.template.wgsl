{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> inverse_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

{{> field8_funcs }}

// Segmented-global bucket reduce, phase 2. One thread per window combines the
// G segment partials produced by phase 1 into the window's Jacobian weighted
// sum, written at slot w*STRIDE (X,Y in red_buf, Z in red_z); jacFinalize does
// the single per-window inversion to affine.
//
//   W = sum_seg seg_ws[seg] + SS * sum_seg seg*seg_tot[seg] = A + SS*B,
//   B = sum_seg seg*seg_tot[seg] = sum_{j=1..G-1} suffix(j),
//       suffix(j) = sum_{seg>=j} seg_tot[seg]   (running-sum identity).
// Bucket i = seg*SS + m then carries global weight (seg*SS + m + 1) = i+1.
//
// No shared memory: each thread reads its own window's partials from global
// seg_buf, so none of the cooperative-shared-memory flakiness.

const PG: u32 = 2u;
const STRIDE: u32 = {{ stride }}u;
const SS: u32 = {{ ss }}u;
const G: u32 = {{ g }}u;
const LOG2_SS: u32 = {{ log2_ss }}u;

@group(0) @binding(0) var<storage, read>       seg_buf: array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> red_buf: array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> red_z:   array<vec4<u32>>;
@group(0) @binding(3) var<uniform>             params:  vec4<u32>;
// params = (M (red_buf element stride), num_windows, _, _)

fn seg_get(at: u32) -> array<u32, 8> {
    let q0 = seg_buf[at + 0u];
    let q1 = seg_buf[at + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}
fn store_x(idx: u32, M: u32, val: array<u32, 8>) {
    let base = PG * idx;
    red_buf[base + 0u] = vec4<u32>(val[0], val[1], val[2], val[3]);
    red_buf[base + 1u] = vec4<u32>(val[4], val[5], val[6], val[7]);
}
fn store_y(idx: u32, M: u32, val: array<u32, 8>) {
    let base = PG * M + PG * idx;
    red_buf[base + 0u] = vec4<u32>(val[0], val[1], val[2], val[3]);
    red_buf[base + 1u] = vec4<u32>(val[4], val[5], val[6], val[7]);
}
fn store_z(idx: u32, val: array<u32, 8>) {
    let base = PG * idx;
    red_z[base + 0u] = vec4<u32>(val[0], val[1], val[2], val[3]);
    red_z[base + 1u] = vec4<u32>(val[4], val[5], val[6], val[7]);
}

fn fr_select_f8(a: array<u32, 8>, b: array<u32, 8>, cond: bool) -> array<u32, 8> {
    return array<u32, 8>(
        select(a[0], b[0], cond), select(a[1], b[1], cond),
        select(a[2], b[2], cond), select(a[3], b[3], cond),
        select(a[4], b[4], cond), select(a[5], b[5], cond),
        select(a[6], b[6], cond), select(a[7], b[7], cond));
}
fn fr_dbl_f8(a: array<u32, 8>) -> array<u32, 8> { return fr_add_f8(a, a); }

struct Jac { x: array<u32, 8>, y: array<u32, 8>, z: array<u32, 8>, }

fn jac_double(p: Jac) -> Jac {
    let A = montgomery_product_f8(p.x, p.x);
    let B = montgomery_product_f8(p.y, p.y);
    let C = montgomery_product_f8(B, B);
    let XpB = fr_add_f8(p.x, B);
    let s = fr_sub_f8(montgomery_product_f8(XpB, XpB), fr_add_f8(A, C));
    let D = fr_dbl_f8(s);
    let E = fr_add_f8(fr_dbl_f8(A), A);
    let F = montgomery_product_f8(E, E);
    let X3 = fr_sub_f8(F, fr_dbl_f8(D));
    let C8 = fr_dbl_f8(fr_dbl_f8(fr_dbl_f8(C)));
    let Y3 = fr_sub_f8(montgomery_product_f8(E, fr_sub_f8(D, X3)), C8);
    let Z3 = fr_dbl_f8(montgomery_product_f8(p.y, p.z));
    return Jac(X3, Y3, Z3);
}

fn jac_add_raw(p1: Jac, p2: Jac) -> Jac {
    let Z1Z1 = montgomery_product_f8(p1.z, p1.z);
    let Z2Z2 = montgomery_product_f8(p2.z, p2.z);
    let U1 = montgomery_product_f8(p1.x, Z2Z2);
    let U2 = montgomery_product_f8(p2.x, Z1Z1);
    let S1 = montgomery_product_f8(montgomery_product_f8(p1.y, p2.z), Z2Z2);
    let S2 = montgomery_product_f8(montgomery_product_f8(p2.y, p1.z), Z1Z1);
    let H = fr_sub_f8(U2, U1);
    let twoH = fr_dbl_f8(H);
    let I = montgomery_product_f8(twoH, twoH);
    let J = montgomery_product_f8(H, I);
    let r = fr_dbl_f8(fr_sub_f8(S2, S1));
    let V = montgomery_product_f8(U1, I);
    let X3 = fr_sub_f8(fr_sub_f8(montgomery_product_f8(r, r), J), fr_dbl_f8(V));
    let S1J = montgomery_product_f8(S1, J);
    let Y3 = fr_sub_f8(montgomery_product_f8(r, fr_sub_f8(V, X3)), fr_dbl_f8(S1J));
    let ZpZ = fr_add_f8(p1.z, p2.z);
    let Z3 = montgomery_product_f8(fr_sub_f8(fr_sub_f8(montgomery_product_f8(ZpZ, ZpZ), Z1Z1), Z2Z2), H);
    return Jac(X3, Y3, Z3);
}

fn jac_add(dst: Jac, src: Jac) -> Jac {
    let sum = jac_add_raw(dst, src);
    let src_inf = is_zero_f8(src.z);
    let dst_inf = is_zero_f8(dst.z);
    var rx = fr_select_f8(sum.x, src.x, dst_inf);
    var ry = fr_select_f8(sum.y, src.y, dst_inf);
    var rz = fr_select_f8(sum.z, src.z, dst_inf);
    rx = fr_select_f8(rx, dst.x, src_inf);
    ry = fr_select_f8(ry, dst.y, src_inf);
    rz = fr_select_f8(rz, dst.z, src_inf);
    return Jac(rx, ry, rz);
}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let w = gid.x;
    let M = params.x;
    let num_windows = params.y;
    if (w >= num_windows) { return; }
    let base = w * STRIDE;
    let p0 = w * G;   // first partial of this window
    let zero = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);

    // B = sum_seg seg*seg_tot[seg] via the suffix running-sum.
    var suffix = Jac(zero, zero, zero);
    var bsum = Jac(zero, zero, zero);
    var j: u32 = G;
    loop {
        if (j <= 1u) { break; }
        j = j - 1u;
        let pb = (p0 + j) * 12u;
        let tot = Jac(seg_get(pb + 0u), seg_get(pb + 2u), seg_get(pb + 4u));
        suffix = jac_add(suffix, tot);
        bsum = jac_add(bsum, suffix);
    }
    // bsum = SS * B
    var d: u32 = 0u;
    loop {
        if (d >= LOG2_SS) { break; }
        bsum = jac_double(bsum);
        d = d + 1u;
    }
    // W = A + SS*B,  A = sum_seg seg_ws[seg].
    var w_acc = bsum;
    var seg: u32 = 0u;
    loop {
        if (seg >= G) { break; }
        let pb = (p0 + seg) * 12u;
        let ws = Jac(seg_get(pb + 6u), seg_get(pb + 8u), seg_get(pb + 10u));
        w_acc = jac_add(w_acc, ws);
        seg = seg + 1u;
    }

    store_x(base, M, w_acc.x);
    store_y(base, M, w_acc.y);
    store_z(base, w_acc.z);
}
