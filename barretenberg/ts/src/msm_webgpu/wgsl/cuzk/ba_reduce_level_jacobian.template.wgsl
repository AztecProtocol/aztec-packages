{{> inverse_funcs }}

{{> field8_funcs }}

// Jacobian variant of one bucket-reduction level. Drop-in for
// ba_reduce_level_bench at the SAME dispatch shape (one workgroup per window,
// C = ceil(ppw/WG) candidates per thread) and the SAME red_buf slot layout,
// but inversion-free: each candidate is a single Jacobian add or double, so
// there is no forward prefix / safegcd / backward peel. The point-at-infinity
// flag `is_present` is replaced by Z == 0 (carried in the separate red_z
// plane, initialised once by ba_reduce_z_init). add-2007-bl / dbl-2009-l,
// a = 0 (BN254). Collisions (P = +/-Q) are assumed absent, matching the
// affine kernel's no-collision assumption for uniformly-random inputs.
//
// This branch carries the per-window schedule in `reduce_sched` (split-c
// aware) rather than baking a single window stride, so the per-level (base,
// pa, pb, ppw, kind) decode here is identical to ba_reduce_level_bench: each
// window reads its own base + level entry, and narrow split-c windows no-op
// the levels past their shorter schedule (ppw == 0).
//
// Field elements are 8x u32 (Lever 2). All arithmetic is in Montgomery form;
// fr_add_f8 / fr_sub_f8 are linear so they act directly on Montgomery values,
// and montgomery_product_f8 is the Montgomery multiply.

const PG: u32 = 2u;
const WG: u32 = {{ workgroup_size }}u;
const KIND_SUFFIX:  u32 = 0u;
const KIND_TREE:    u32 = 1u;
const KIND_DOUBLE:  u32 = 2u;

@group(0) @binding(0) var<storage, read_write> red_buf:      array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> red_z:        array<vec4<u32>>;
@group(0) @binding(2) var<uniform>             cparams:      vec4<u32>;
@group(0) @binding(3) var<uniform>             lparams:      vec4<u32>;
@group(0) @binding(4) var<storage, read>       reduce_sched: array<vec4<u32>>;
// cparams = (M (red_buf element stride), _, max_levels, _) — constant across levels.
// lparams = (lv, _, _, _) — the level index this dispatch executes.
// reduce_sched: per-window schedule table, row stride (1 + max_levels) vec4;
//   row[0].x = base (window's first red_buf slot), row[1 + lv] = (pa, pb, ppw, kind).

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

// 2x, 3x, 8x by repeated modular add (cheap vs a multiply). The _wide
// double skips the conditional reduce — montmul-input use only, operand < 2p.
fn fr_dbl_f8(a: array<u32, 8>) -> array<u32, 8> { return fr_add_f8(a, a); }
fn fr_dbl_wide_f8(a: array<u32, 8>) -> array<u32, 8> { return fr_add_wide_f8(a, a); }

struct Jac { x: array<u32, 8>, y: array<u32, 8>, z: array<u32, 8>, }

// EFD g1p/shortw-jacobian-0/dbl-2009-l (a = 0). Infinity-safe: Z == 0 in =>
// Z3 = 2*Y*Z = 0 out, so the result stays the point at infinity.
fn jac_double(p: Jac) -> Jac {
    let A = montgomery_product_f8(p.x, p.x);
    let B = montgomery_product_f8(p.y, p.y);
    let C = montgomery_product_f8(B, B);
    // Wide bound chain (montmul inputs only; cap is 2^256 = 5.29p):
    // XpB < 2p + 1.34p = 3.34p; E = 3A < 4.03p; D - X3 < 4p. The reducing
    // ops keep every stored coordinate and every fr_sub_f8 operand < 2p.
    let XpB = fr_add_wide_f8(p.x, B);
    let s = fr_sub_f8(montgomery_product_f8(XpB, XpB), fr_add_f8(A, C));
    let D = fr_dbl_f8(s);
    let E = fr_add_wide_f8(fr_dbl_wide_f8(A), A); // 3A
    let F = montgomery_product_f8(E, E);
    let X3 = fr_sub_f8(F, fr_dbl_f8(D));
    let C8 = fr_dbl_f8(fr_dbl_f8(fr_dbl_f8(C))); // 8C
    let Y3 = fr_sub_f8(montgomery_product_f8(E, fr_sub_wide_f8(D, X3)), C8);
    // Z3 stays reducing: it is stored, and an exact-zero Z (infinity) must
    // propagate as the exact-zero bit pattern (mm(y, 0) = 0; 0 + 0 = 0).
    let Z3 = fr_dbl_f8(montgomery_product_f8(p.y, p.z));
    return Jac(X3, Y3, Z3);
}

// EFD add-2007-bl (general Jacobian + Jacobian). Result is only valid when
// both inputs are finite; the caller selects against the Z == 0 cases.
fn jac_add_raw(p1: Jac, p2: Jac) -> Jac {
    let Z1Z1 = montgomery_product_f8(p1.z, p1.z);
    let Z2Z2 = montgomery_product_f8(p2.z, p2.z);
    let U1 = montgomery_product_f8(p1.x, Z2Z2);
    let U2 = montgomery_product_f8(p2.x, Z1Z1);
    let S1 = montgomery_product_f8(montgomery_product_f8(p1.y, p2.z), Z2Z2);
    let S2 = montgomery_product_f8(montgomery_product_f8(p2.y, p1.z), Z1Z1);
    // H stays reducing (< 2p) so twoH = 2H < 4p; r < 4p. Both feed only
    // montmuls. rr = mm(r,r) < 1.19p, so the reducing X3/Y3 chains keep
    // every fr_sub_f8 operand and stored coordinate < 2p.
    let H = fr_sub_f8(U2, U1);
    let twoH = fr_dbl_wide_f8(H);
    let I = montgomery_product_f8(twoH, twoH);
    let J = montgomery_product_f8(H, I);
    let r = fr_dbl_wide_f8(fr_sub_f8(S2, S1));
    let V = montgomery_product_f8(U1, I);
    let X3 = fr_sub_f8(fr_sub_f8(montgomery_product_f8(r, r), J), fr_dbl_f8(V));
    let S1J = montgomery_product_f8(S1, J);
    let Y3 = fr_sub_f8(montgomery_product_f8(r, fr_sub_wide_f8(V, X3)), fr_dbl_f8(S1J));
    let ZpZ = fr_add_wide_f8(p1.z, p2.z);
    // TIGHTEST wide chain in the codebase: mm(ZpZ,ZpZ) < 1.19p (ZpZ < 4p),
    // first wide sub < 3.19p (minuend cap is 3.29p), second < 5.19p — just
    // under the 2^256 = 5.292p representability cap — then into the montmul.
    let Z3 = montgomery_product_f8(fr_sub_wide_f8(fr_sub_wide_f8(montgomery_product_f8(ZpZ, ZpZ), Z1Z1), Z2Z2), H);
    return Jac(X3, Y3, Z3);
}

// dst += src with point-at-infinity handling (Z == 0): if src is infinity
// keep dst; if dst is infinity copy src; else real add. Branchless.
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
fn main(@builtin(workgroup_id) wgid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
    let w = wgid.x;
    let tid = lid.x;
    let M = cparams.x;
    let max_levels = cparams.z;
    let lv = lparams.x;
    let row = w * (1u + max_levels);
    let base = reduce_sched[row].x;
    let e = reduce_sched[row + 1u + lv];
    let pa = e.x;
    let pb = e.y;
    let ppw = e.z;
    let kind = e.w;
    let C = (ppw + WG - 1u) / WG;

    if (tid * C >= ppw) {
        return;
    }

    for (var k: u32 = 0u; k < C; k = k + 1u) {
        let j2 = tid * C + k;
        if (j2 >= ppw) { break; }

        if (kind == KIND_DOUBLE) {
            let slot = base + (j2 + 1u) * pa;
            let p = Jac(load_x(slot, M), load_y(slot, M), load_z(slot));
            let r = jac_double(p);
            store_x(slot, M, r.x);
            store_y(slot, M, r.y);
            store_z(slot, r.z);
        } else {
            var src: u32;
            var dst: u32;
            if (kind == KIND_SUFFIX) {
                src = base + j2 * pa + pb;
                dst = src - 1u;
            } else {
                dst = base + 2u * j2 * pa;
                src = base + (2u * j2 + 1u) * pa;
            }
            let pd = Jac(load_x(dst, M), load_y(dst, M), load_z(dst));
            let ps = Jac(load_x(src, M), load_y(src, M), load_z(src));
            let r = jac_add(pd, ps);
            store_x(dst, M, r.x);
            store_y(dst, M, r.y);
            store_z(dst, r.z);
        }
    }
}
