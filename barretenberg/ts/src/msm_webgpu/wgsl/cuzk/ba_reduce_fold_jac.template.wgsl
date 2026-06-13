


{{> field8_funcs }}

// Jacobian fold level (GROUPED_REDUCE_PLAN.md): the thread-starved-level
// variant of ba_reduce_fold. Same strided walk and outputs, but Jacobian
// accumulators and ZERO inversions — used when a level's chunk count is
// below the device's saturation width, where batch-affine cannot reach a
// useful batch size (at C ≤ 2 a mixed Jacobian add is cheaper anyway).
// Barrier-less and inverse-free: the smallest, most driver-friendly shape.
//
// lparams.y (inputs_jac): 0 = inputs are affine (+ is_present), z := R or 0;
// 1 = inputs were written by a previous Jacobian fold level (z in red_z).
// Outputs are always Jacobian: x/y planes + red_z, is_present := finite.
// Presence rides in per-accumulator booleans (no z compares); the
// `alg += running` structural P+P resolves through the alg_dup boolean
// (select the doubling — never a field comparison).

const PG: u32 = 2u;
const WG: u32 = {{ workgroup_size }}u;
const NSTREAMS: u32 = {{ nstreams }}u;

@group(0) @binding(0) var<storage, read_write> red_buf:    array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> red_z:      array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> is_present: array<u32>;
@group(0) @binding(3) var<uniform>             cparams:    vec4<u32>;
@group(0) @binding(4) var<uniform>             lparams:    vec4<u32>;
@group(0) @binding(5) var<storage, read>       fold_sched: array<vec4<u32>>;
// cparams = (M (red_buf element stride), _, max_fold_levels, _).
// lparams = (lv, inputs_jac, 0, 0).

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

fn jac_select(a: Jac, b: Jac, cond: bool) -> Jac {
    return Jac(fr_select_f8(a.x, b.x, cond), fr_select_f8(a.y, b.y, cond), fr_select_f8(a.z, b.z, cond));
}

// EFD dbl-2009-l (a = 0). Infinity-safe.
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

// add-2007-bl; presence handled by the CALLER's booleans (selects), so no
// z comparisons here. Result valid only when both inputs are finite and
// distinct — exactly the caller's select discipline.
fn jac_add_raw(dst: Jac, src: Jac) -> Jac {
    let Z1Z1 = montgomery_product_f8(dst.z, dst.z);
    let Z2Z2 = montgomery_product_f8(src.z, src.z);
    let U1 = montgomery_product_f8(dst.x, Z2Z2);
    let U2 = montgomery_product_f8(src.x, Z1Z1);
    let S1 = montgomery_product_f8(montgomery_product_f8(dst.y, src.z), Z2Z2);
    let S2 = montgomery_product_f8(montgomery_product_f8(src.y, dst.z), Z1Z1);
    let H = fr_sub_f8(U2, U1);
    let twoH = fr_dbl_f8(H);
    let I = montgomery_product_f8(twoH, twoH);
    let J = montgomery_product_f8(H, I);
    let r = fr_dbl_f8(fr_sub_f8(S2, S1));
    let V = montgomery_product_f8(U1, I);
    let X3 = fr_sub_f8(fr_sub_f8(montgomery_product_f8(r, r), J), fr_dbl_f8(V));
    let S1J = montgomery_product_f8(S1, J);
    let Y3 = fr_sub_f8(montgomery_product_f8(r, fr_sub_f8(V, X3)), fr_dbl_f8(S1J));
    let ZpZ = fr_add_f8(dst.z, src.z);
    let Z3 = montgomery_product_f8(fr_sub_f8(fr_sub_f8(montgomery_product_f8(ZpZ, ZpZ), Z1Z1), Z2Z2), H);
    return Jac(X3, Y3, Z3);
}

// dst += src with boolean presence: skip (src absent), copy (dst absent),
// add — all selects.
fn jac_acc(dst: Jac, dstp: bool, src: Jac, srcp: bool) -> Jac {
    let sum = jac_add_raw(dst, src);
    var out = jac_select(dst, sum, srcp && dstp);
    out = jac_select(out, src, srcp && !dstp);
    return out;
}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(workgroup_id) wgid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
    let w = wgid.y;
    let q = wgid.x * WG + lid.x;
    let M_RED = cparams.x;
    let maxl = cparams.z;
    let lv = lparams.x;
    let inputs_jac = lparams.y != 0u;
    let row = w * (1u + maxl);
    let base = fold_sched[row].x;
    let e = fold_sched[row + 1u + lv];
    let G = e.x;
    let M = e.y;
    let B = e.z;
    if (G == 0u || q >= G) {
        return;
    }
    let r1: array<u32, 8> = get_r_f8();
    let zero = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
    let jinf = Jac(r1, r1, zero);

    var run = jinf; var run_p = false;
    var alg = jinf; var alg_p = false;
    var alg_dup = false;
{{#s0}}    var st0 = jinf; var st0_p = false;
{{/s0}}{{#s1}}    var st1 = jinf; var st1_p = false;
{{/s1}}
    // Rows are walked DESCENDING; ragged rows (rowslot >= B) exist only at
    // the top, so they are excluded from the trip count instead of guarded
    // in-body. The body is straight-line (selects only, no branches): the
    // Mali driver's loop-unroll pass abort()s out-of-memory recomputing
    // dominator info when a branchy body this large gets unrolled (see
    // FOLD_TOWER_STATUS_REPORT.md).
    let rows = min(M, (B - 1u - q) / G + 1u);
    for (var t: u32 = 0u; t < rows; t = t + 1u) {
        let i = rows - 1u - t;
        let rowslot = i * G + q;

        // alg += run: structural P+P resolves via alg_dup (select doubling).
        let sum0 = jac_add_raw(alg, run);
        var nalg = jac_select(alg, sum0, run_p && alg_p && !alg_dup);
        nalg = jac_select(nalg, jac_double(alg), run_p && alg_p && alg_dup);
        nalg = jac_select(nalg, run, run_p && !alg_p);
        alg = nalg;
        alg_dup = select(alg_dup, run_p && !alg_p, run_p);
        alg_p = alg_p || run_p;

        // run += V[row].
        let s1slot = base + rowslot;
        let vp = is_present[s1slot] != 0u;
        let vz = fr_select_f8(fr_select_f8(zero, r1, vp), load_z(s1slot), inputs_jac);
        let v = Jac(load_x(s1slot, M_RED), load_y(s1slot, M_RED), vz);
        run = jac_acc(run, run_p, v, vp);
        run_p = run_p || vp;
        alg_dup = alg_dup && !vp;
{{#s0}}
        let t0slot = base + B + rowslot;
        let t0p = is_present[t0slot] != 0u;
        let t0z = fr_select_f8(fr_select_f8(zero, r1, t0p), load_z(t0slot), inputs_jac);
        let v0 = Jac(load_x(t0slot, M_RED), load_y(t0slot, M_RED), t0z);
        st0 = jac_acc(st0, st0_p, v0, t0p);
        st0_p = st0_p || t0p;
{{/s0}}{{#s1}}
        let t1slot = base + 2u * B + rowslot;
        let t1p = is_present[t1slot] != 0u;
        let t1z = fr_select_f8(fr_select_f8(zero, r1, t1p), load_z(t1slot), inputs_jac);
        let v1 = Jac(load_x(t1slot, M_RED), load_y(t1slot, M_RED), t1z);
        st1 = jac_acc(st1, st1_p, v1, t1p);
        st1_p = st1_p || t1p;
{{/s1}}    }

    store_x(base + q, M_RED, run.x);
    store_y(base + q, M_RED, run.y);
    store_z(base + q, fr_select_f8(zero, run.z, run_p));
    is_present[base + q] = u32(run_p);
{{#s0}}    store_x(base + G + q, M_RED, st0.x);
    store_y(base + G + q, M_RED, st0.y);
    store_z(base + G + q, fr_select_f8(zero, st0.z, st0_p));
    is_present[base + G + q] = u32(st0_p);
{{/s0}}{{#s1}}    store_x(base + 2u * G + q, M_RED, st1.x);
    store_y(base + 2u * G + q, M_RED, st1.y);
    store_z(base + 2u * G + q, fr_select_f8(zero, st1.z, st1_p));
    is_present[base + 2u * G + q] = u32(st1_p);
{{/s1}}    store_x(base + (1u + NSTREAMS) * G + q, M_RED, alg.x);
    store_y(base + (1u + NSTREAMS) * G + q, M_RED, alg.y);
    store_z(base + (1u + NSTREAMS) * G + q, fr_select_f8(zero, alg.z, alg_p));
    is_present[base + (1u + NSTREAMS) * G + q] = u32(alg_p);

    {{{ recompile }}}
}
