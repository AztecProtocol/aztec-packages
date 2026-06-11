{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

{{> field8_funcs }}

// Lean M = 2 fold level (the width-maximal shape adaptive towers produce at
// small N): one thread per output column does exactly ONE real group add —
//   run_q = V[q] + V[G+q]
//   alg_q = V[G+q]            (the Λ contribution at M = 2 is a copy)
//   st_a  = S_a[q] + S_a[G+q] (one add per carried stream)
// No row loop, no running-sum machinery, no doubling path: V[q] and V[G+q]
// are distinct buckets, so the pipeline-wide no-collision assumption removes
// the P+P case entirely. Presence is four-case selects around one add.
// Compile-time variants: affine inputs (level 0 — both z = 1, the add drops
// to 6 montmuls) vs chained-Jacobian inputs (z in red_z, full add). Outputs
// are always Jacobian (x/y planes + red_z; absent ⇒ z = 0, is_present 0).
//
// The host dispatches this kernel only for levels whose M == 2 in EVERY
// window's schedule (no split-c); the general fold kernels keep all other
// shapes.

const PG: u32 = 2u;
const WG: u32 = {{ workgroup_size }}u;

@group(0) @binding(0) var<storage, read_write> red_buf:    array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> red_z:      array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> is_present: array<u32>;
@group(0) @binding(3) var<uniform>             cparams:    vec4<u32>;
@group(0) @binding(4) var<uniform>             lparams:    vec4<u32>;
@group(0) @binding(5) var<storage, read>       fold_sched: array<vec4<u32>>;
// cparams = (M (red_buf element stride), _, max_fold_levels, _).
// lparams = (lv, _, _, _).

fn load_x(idx: u32, M: u32) -> array<u32, 8> {
    let base = PG * idx;
    let q0 = red_buf[base + 0u];
    let q1 = red_buf[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}
fn load_y(idx: u32, M: u32) -> array<u32, 8> {
    let base = PG * M + PG * idx;
    let q0 = red_buf[base + 0u];
    let q1 = red_buf[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}
fn load_z(idx: u32) -> array<u32, 8> {
    let base = PG * idx;
    let q0 = red_z[base + 0u];
    let q1 = red_z[base + 1u];
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

{{#inputs_jac}}
// add-2007-bl, both operands full Jacobian (chained from a previous fold).
fn pair_add(ax: array<u32, 8>, ay: array<u32, 8>, az: array<u32, 8>,
            bx: array<u32, 8>, by: array<u32, 8>, bz: array<u32, 8>) -> Jac {
    let Z1Z1 = montgomery_product_f8(az, az);
    let Z2Z2 = montgomery_product_f8(bz, bz);
    let U1 = montgomery_product_f8(ax, Z2Z2);
    let U2 = montgomery_product_f8(bx, Z1Z1);
    let S1 = montgomery_product_f8(montgomery_product_f8(ay, bz), Z2Z2);
    let S2 = montgomery_product_f8(montgomery_product_f8(by, az), Z1Z1);
    let H = fr_sub_f8(U2, U1);
    let twoH = fr_dbl_f8(H);
    let I = montgomery_product_f8(twoH, twoH);
    let J = montgomery_product_f8(H, I);
    let r = fr_dbl_f8(fr_sub_f8(S2, S1));
    let V = montgomery_product_f8(U1, I);
    let X3 = fr_sub_f8(fr_sub_f8(montgomery_product_f8(r, r), J), fr_dbl_f8(V));
    let S1J = montgomery_product_f8(S1, J);
    let Y3 = fr_sub_f8(montgomery_product_f8(r, fr_sub_f8(V, X3)), fr_dbl_f8(S1J));
    let ZpZ = fr_add_f8(az, bz);
    let Z3 = montgomery_product_f8(fr_sub_f8(fr_sub_f8(montgomery_product_f8(ZpZ, ZpZ), Z1Z1), Z2Z2), H);
    return Jac(X3, Y3, Z3);
}
{{/inputs_jac}}
{{^inputs_jac}}
// mmadd-2007-bl: both operands affine (z = 1) — 6 montmuls.
fn pair_add(ax: array<u32, 8>, ay: array<u32, 8>,
            bx: array<u32, 8>, by: array<u32, 8>) -> Jac {
    let H = fr_sub_f8(bx, ax);
    let twoH = fr_dbl_f8(H);
    let I = montgomery_product_f8(twoH, twoH);
    let J = montgomery_product_f8(H, I);
    let r = fr_dbl_f8(fr_sub_f8(by, ay));
    let V = montgomery_product_f8(ax, I);
    let X3 = fr_sub_f8(fr_sub_f8(montgomery_product_f8(r, r), J), fr_dbl_f8(V));
    let YJ = montgomery_product_f8(ay, J);
    let Y3 = fr_sub_f8(montgomery_product_f8(r, fr_sub_f8(V, X3)), fr_dbl_f8(YJ));
    let Z3 = twoH;
    return Jac(X3, Y3, Z3);
}
{{/inputs_jac}}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(workgroup_id) wgid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
    let w = wgid.y;
    let q = wgid.x * WG + lid.x;
    let M_RED = cparams.x;
    let maxl = cparams.z;
    let lv = lparams.x;
    let row = w * (1u + maxl);
    let base = fold_sched[row].x;
    let e = fold_sched[row + 1u + lv];
    let G = e.x;
    let B = e.z;
    if (G == 0u || q >= G) {
        return;
    }
    let r1: array<u32, 8> = get_r_f8();
    let zero = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);

    // run = V[q] + V[G+q]; alg = V[G+q].
    let s0 = base + q;
    let s1 = base + G + q;
    let p0 = is_present[s0] != 0u;
    let p1 = is_present[s1] != 0u;
    let x0 = load_x(s0, M_RED);
    let y0 = load_y(s0, M_RED);
    let x1 = load_x(s1, M_RED);
    let y1 = load_y(s1, M_RED);
{{#inputs_jac}}
    let z0 = load_z(s0);
    let z1 = load_z(s1);
    let sum = pair_add(x0, y0, z0, x1, y1, z1);
{{/inputs_jac}}
{{^inputs_jac}}
    let z0 = fr_select_f8(zero, r1, p0);
    let z1 = fr_select_f8(zero, r1, p1);
    let sum = pair_add(x0, y0, x1, y1);
{{/inputs_jac}}
    let both = p0 && p1;
    var rx = fr_select_f8(x0, sum.x, both);
    var ry = fr_select_f8(y0, sum.y, both);
    var rz = fr_select_f8(z0, sum.z, both);
    rx = fr_select_f8(rx, x1, p1 && !p0);
    ry = fr_select_f8(ry, y1, p1 && !p0);
    rz = fr_select_f8(rz, z1, p1 && !p0);
    let rp = p0 || p1;
    store_x(base + q, M_RED, rx);
    store_y(base + q, M_RED, ry);
    store_z(base + q, fr_select_f8(zero, rz, rp));
    is_present[base + q] = u32(rp);
{{#s0}}
    {
        let t0 = base + 1u * B + q;
        let t1 = base + 1u * B + G + q;
        let tp0 = is_present[t0] != 0u;
        let tp1 = is_present[t1] != 0u;
        let tx0 = load_x(t0, M_RED);
        let ty0 = load_y(t0, M_RED);
        let tx1 = load_x(t1, M_RED);
        let ty1 = load_y(t1, M_RED);
{{#inputs_jac}}
        let tz0 = load_z(t0);
        let tz1 = load_z(t1);
        let tsum = pair_add(tx0, ty0, tz0, tx1, ty1, tz1);
{{/inputs_jac}}
{{^inputs_jac}}
        let tz0 = fr_select_f8(zero, r1, tp0);
        let tz1 = fr_select_f8(zero, r1, tp1);
        let tsum = pair_add(tx0, ty0, tx1, ty1);
{{/inputs_jac}}
        let tboth = tp0 && tp1;
        var ox = fr_select_f8(tx0, tsum.x, tboth);
        var oy = fr_select_f8(ty0, tsum.y, tboth);
        var oz = fr_select_f8(tz0, tsum.z, tboth);
        ox = fr_select_f8(ox, tx1, tp1 && !tp0);
        oy = fr_select_f8(oy, ty1, tp1 && !tp0);
        oz = fr_select_f8(oz, tz1, tp1 && !tp0);
        let op = tp0 || tp1;
        store_x(base + 1u * G + q, M_RED, ox);
        store_y(base + 1u * G + q, M_RED, oy);
        store_z(base + 1u * G + q, fr_select_f8(zero, oz, op));
        is_present[base + 1u * G + q] = u32(op);
    }
{{/s0}}
{{#s1}}
    {
        let t0 = base + 2u * B + q;
        let t1 = base + 2u * B + G + q;
        let tp0 = is_present[t0] != 0u;
        let tp1 = is_present[t1] != 0u;
        let tx0 = load_x(t0, M_RED);
        let ty0 = load_y(t0, M_RED);
        let tx1 = load_x(t1, M_RED);
        let ty1 = load_y(t1, M_RED);
{{#inputs_jac}}
        let tz0 = load_z(t0);
        let tz1 = load_z(t1);
        let tsum = pair_add(tx0, ty0, tz0, tx1, ty1, tz1);
{{/inputs_jac}}
{{^inputs_jac}}
        let tz0 = fr_select_f8(zero, r1, tp0);
        let tz1 = fr_select_f8(zero, r1, tp1);
        let tsum = pair_add(tx0, ty0, tx1, ty1);
{{/inputs_jac}}
        let tboth = tp0 && tp1;
        var ox = fr_select_f8(tx0, tsum.x, tboth);
        var oy = fr_select_f8(ty0, tsum.y, tboth);
        var oz = fr_select_f8(tz0, tsum.z, tboth);
        ox = fr_select_f8(ox, tx1, tp1 && !tp0);
        oy = fr_select_f8(oy, ty1, tp1 && !tp0);
        oz = fr_select_f8(oz, tz1, tp1 && !tp0);
        let op = tp0 || tp1;
        store_x(base + 2u * G + q, M_RED, ox);
        store_y(base + 2u * G + q, M_RED, oy);
        store_z(base + 2u * G + q, fr_select_f8(zero, oz, op));
        is_present[base + 2u * G + q] = u32(op);
    }
{{/s1}}
    // alg = V[G+q] verbatim (Λ at M = 2 weights row 1 by exactly 1).
    store_x(base + {{ alg_off }}u * G + q, M_RED, x1);
    store_y(base + {{ alg_off }}u * G + q, M_RED, y1);
    store_z(base + {{ alg_off }}u * G + q, fr_select_f8(zero, z1, p1));
    is_present[base + {{ alg_off }}u * G + q] = u32(p1);

    {{{ recompile }}}
}
