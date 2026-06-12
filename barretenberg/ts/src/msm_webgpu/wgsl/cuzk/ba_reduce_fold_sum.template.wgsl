


{{> field8_funcs }}

// Fold-tower window sum, BARRIER-LESS (GROUPED_REDUCE_PLAN.md): dispatched
// twice. Each thread (w, s) plainly sums the strided subset {s, s+S, …} of
// window w's pre-weighted values (ba_reduce_fold_weight's outputs: Jacobian,
// x/y planes + red_z, absent ⇒ z == 0) and writes the partial to slot s.
//   pass 1: S = SUM_FAN (8)  — n_vals ≤ 256 values → 8 partials per window
//   pass 2: S = 1            — 8 partials → the window root at the base slot
// Chains are ≤ 32 adds (pass 1) / 8 adds (pass 2). No workgroup memory, no
// barriers, no inversions, no division — the Mali driver cannot newly
// compile barrier+shared+big-field kernels (its cached ba_fused_tail_coop
// binary masked this for months), so the entire grouped path stays in the
// barrier-less family. lparams = (S_out, S_in, 0, 0): each output slot s
// sums input slots {s + k·S_out : s + k·S_out < S_in_total}, where
// S_in_total = n_vals on pass 1 and SUM_FAN on pass 2.
//
// The root lands at the window base for ba_reduce_jac_finalize.

const PG: u32 = 2u;
const WG: u32 = {{ workgroup_size }}u;
const SUM_FAN: u32 = 8u;

@group(0) @binding(0) var<storage, read_write> red_buf:    array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> red_z:      array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> is_present: array<u32>;
@group(0) @binding(3) var<uniform>             cparams:    vec4<u32>;
@group(0) @binding(4) var<uniform>             lparams:    vec4<u32>;
@group(0) @binding(5) var<storage, read>       fold_sched: array<vec4<u32>>;
// cparams = (M (red_buf element stride), _, max_fold_levels, _).
// lparams = (S_out, use_fan_in, 0, 0): use_fan_in = 1 ⇒ inputs are the
// SUM_FAN partials of pass 1, else the full pre-weighted value arrays.

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
fn load_zp(idx: u32) -> array<u32, 8> {
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

// add-2007-bl; presence via booleans. Operands are weighted values / partials
// over disjoint sets — the pipeline-wide no-collision assumption applies.
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

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(workgroup_id) wgid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
    let w = wgid.y;
    let s = wgid.x * WG + lid.x;
    let M_RED = cparams.x;
    let maxl = cparams.z;
    let S_out = lparams.x;
    let use_fan_in = lparams.y != 0u;
    if (s >= S_out) {
        return;
    }
    let row = w * (1u + maxl);
    let r0 = fold_sched[row];
    let base = r0.x;
    let B0 = r0.y;
    let n_levels = r0.z;
    var L = B0;
    if (n_levels > 0u) {
        L = fold_sched[row + n_levels].x;
    }
    var in_total = (1u + n_levels) * L;
    if (use_fan_in) {
        in_total = min(SUM_FAN, in_total);
    }
    if (s >= in_total) {
        // Fewer inputs than output slots: emit an absent partial.
        let zero0 = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
        store_z(base + s, zero0);
        is_present[base + s] = 0u;
        return;
    }

    let zero = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
    let r1 = get_r_f8();
    var acc = Jac(r1, r1, zero);
    var acc_p = false;
    for (var v: u32 = s; v < in_total; v = v + S_out) {
        let slot = base + v;
        let p = is_present[slot] != 0u;
        let z = fr_select_f8(zero, load_zp(slot), p);
        let pt = Jac(load_x(slot, M_RED), load_y(slot, M_RED), z);
        let sum = jac_add_raw(acc, pt);
        acc = jac_select(acc, jac_select(pt, sum, acc_p), p);
        acc_p = acc_p || p;
    }

    store_x(base + s, M_RED, acc.x);
    store_y(base + s, M_RED, acc.y);
    store_z(base + s, fr_select_f8(zero, acc.z, acc_p));
    is_present[base + s] = u32(acc_p);

    {{{ recompile }}}
}
