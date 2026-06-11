{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

{{> field8_funcs }}

// Fold-tower value weighting (GROUPED_REDUCE_PLAN.md): ONE THREAD PER VALUE
// multiplies each of the last fold level's values by its scalar weight —
//   R[idx]      × (idx + 1)
//   stream_a[·] × G_{a-1}      (the birth level's chunk count, a power of two)
// via a dynamic-trip double-and-add (weights ≤ 512), leaving Jacobian
// (x/y planes + red_z, absent ⇒ z == 0) in place for ba_reduce_fold_sum's
// plain pair-tree. Barrier-less, inverse-less, division-less (L is a power
// of two ⇒ shifts) — the kernel family that compiles everywhere. At
// post-fold scale this is ~hundreds of values per window: the weighting
// ALU is trivial and buys a scan-free, weight-free sum stage.

const PG: u32 = 2u;
const WG: u32 = {{ workgroup_size }}u;

@group(0) @binding(0) var<storage, read_write> red_buf:    array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> red_z:      array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> is_present: array<u32>;
@group(0) @binding(3) var<uniform>             cparams:    vec4<u32>;
@group(0) @binding(4) var<storage, read>       fold_sched: array<vec4<u32>>;
// cparams = (M (red_buf element stride), _, max_fold_levels, _).
// fold_sched rows as in ba_reduce_fold; row[0].w = inputs carry z in red_z.

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

// add-2007-bl; presence via the caller's booleans (no z compares); operands
// in the double-and-add are (w mod 2^b)·P vs 2^b·P — never equal, so no
// collision handling is needed.
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
    let v = wgid.x * WG + lid.x;
    let M_RED = cparams.x;
    let maxl = cparams.z;
    let row = w * (1u + maxl);
    let r0 = fold_sched[row];
    let base = r0.x;
    let B0 = r0.y;
    let n_levels = r0.z;
    let z_plane = r0.w != 0u;
    var L = B0;
    if (n_levels > 0u) {
        L = fold_sched[row + n_levels].x;
    }
    let n_vals = (1u + n_levels) * L;
    if (v >= n_vals) {
        return;
    }
    let lshift = firstTrailingBit(L); // L is a power of two
    let a = v >> lshift;
    let idx = v & (L - 1u);

    let zero = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
    let r1 = get_r_f8();
    let slot = base + v;
    let p = is_present[slot] != 0u;
    var z = fr_select_f8(zero, r1, p);
    if (z_plane) { z = fr_select_f8(zero, load_zp(slot), p); }
    var pt = Jac(load_x(slot, M_RED), load_y(slot, M_RED), z);

    var wgt = idx + 1u;
    if (a >= 1u) {
        wgt = fold_sched[row + a].x; // birth level's G (a power of two)
    }

    // term := wgt · pt, dynamic-trip double-and-add (1 add + 1 double site).
    var term = Jac(r1, r1, zero);
    var term_p = false;
    loop {
        if (wgt == 0u) { break; }
        if ((wgt & 1u) == 1u) {
            let sum = jac_add_raw(term, pt);
            term = jac_select(pt, sum, term_p);
            term_p = true;
        }
        wgt = wgt >> 1u;
        if (wgt == 0u) { break; }
        pt = jac_double(pt);
    }

    store_x(slot, M_RED, term.x);
    store_y(slot, M_RED, term.y);
    store_z(slot, fr_select_f8(zero, term.z, term_p && p));
    is_present[slot] = u32(term_p && p);

    {{{ recompile }}}
}
