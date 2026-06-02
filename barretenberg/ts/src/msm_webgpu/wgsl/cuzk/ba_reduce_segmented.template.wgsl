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

// Two-level segmented bucket reduction (the reformulation, Phase 2a).
//
// Per window the reduce computes W = Sum_{j=0..STRIDE-1} (j+1)*P[j]. Split the
// STRIDE buckets into G segments of size m = STRIDE/G:
//
//   W = m*CoarseW + FineSum
//     segTotal[s]  = Sum_{i in seg} P[i]                      (segment sum)
//     segLocalW[s] = Sum_{i=0..m-1} (i+1)*P[s*m+i]            (in-segment weighted sum)
//     CoarseW      = Sum_{s=0..G-1} s*segTotal[s]             (weighted sum over segments)
//     FineSum      = Sum_{s=0..G-1} segLocalW[s]
//
// The COARSE phase reads only the ORIGINAL affine buckets (never a doubled
// point), so its adds are affine-eligible; the weight application (the *m and
// the *s) lives entirely in the FINE phase. This phase-2a kernel runs both
// phases in Jacobian to validate the decomposition; coord specialisation
// (affine coarse) is layered on next.
//
// phase 0 (COARSE): one thread per (window, segment). Serial suffix
//   running-sum over the m buckets -> (segTotal, segLocalW) into seg_buf.
// phase 1 (FINE): one thread per window. Combine the G summaries -> W, then
//   Jacobian->affine into red_buf slot w*stride (the existing gather reads it).
//
// Infinity (empty bucket / empty accumulator) is Z == 0; jac_add absorbs it.

const PG: u32 = 2u;
const WG: u32 = {{ workgroup_size }}u;

@group(0) @binding(0) var<storage, read_write> red_buf:    array<vec4<u32>>;
@group(0) @binding(1) var<storage, read>       is_present: array<u32>;
@group(0) @binding(2) var<storage, read_write> seg_buf:    array<vec4<u32>>;
@group(0) @binding(3) var<uniform>             cparams:    vec4<u32>; // (M_red, num_windows, stride, phase)
@group(0) @binding(4) var<uniform>             sparams:    vec4<u32>; // (G, m, log2m, _)

fn load_x(idx: u32, M: u32) -> array<u32, 8> {
    let base = PG * idx;
    let q0 = red_buf[base + 0u]; let q1 = red_buf[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}
fn load_y(idx: u32, M: u32) -> array<u32, 8> {
    let base = PG * M + PG * idx;
    let q0 = red_buf[base + 0u]; let q1 = red_buf[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}
fn store_x(idx: u32, M: u32, v: array<u32, 8>) {
    let base = PG * idx;
    red_buf[base + 0u] = vec4<u32>(v[0], v[1], v[2], v[3]);
    red_buf[base + 1u] = vec4<u32>(v[4], v[5], v[6], v[7]);
}
fn store_y(idx: u32, M: u32, v: array<u32, 8>) {
    let base = PG * M + PG * idx;
    red_buf[base + 0u] = vec4<u32>(v[0], v[1], v[2], v[3]);
    red_buf[base + 1u] = vec4<u32>(v[4], v[5], v[6], v[7]);
}

struct Jac { x: array<u32, 8>, y: array<u32, 8>, z: array<u32, 8>, }

fn jac_inf() -> Jac {
    let z = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
    return Jac(z, z, z);
}
fn fr_sel(a: array<u32, 8>, b: array<u32, 8>, c: bool) -> array<u32, 8> {
    return array<u32, 8>(
        select(a[0], b[0], c), select(a[1], b[1], c), select(a[2], b[2], c), select(a[3], b[3], c),
        select(a[4], b[4], c), select(a[5], b[5], c), select(a[6], b[6], c), select(a[7], b[7], c));
}
fn fr_dbl(a: array<u32, 8>) -> array<u32, 8> { return fr_add_f8(a, a); }

fn jac_double(p: Jac) -> Jac {
    let A = montgomery_product_f8(p.x, p.x);
    let B = montgomery_product_f8(p.y, p.y);
    let C = montgomery_product_f8(B, B);
    let XpB = fr_add_f8(p.x, B);
    let s = fr_sub_f8(montgomery_product_f8(XpB, XpB), fr_add_f8(A, C));
    let D = fr_dbl(s);
    let E = fr_add_f8(fr_dbl(A), A);
    let F = montgomery_product_f8(E, E);
    let X3 = fr_sub_f8(F, fr_dbl(D));
    let C8 = fr_dbl(fr_dbl(fr_dbl(C)));
    let Y3 = fr_sub_f8(montgomery_product_f8(E, fr_sub_f8(D, X3)), C8);
    let Z3 = fr_dbl(montgomery_product_f8(p.y, p.z));
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
    let twoH = fr_dbl(H);
    let I = montgomery_product_f8(twoH, twoH);
    let J = montgomery_product_f8(H, I);
    let r = fr_dbl(fr_sub_f8(S2, S1));
    let V = montgomery_product_f8(U1, I);
    let X3 = fr_sub_f8(fr_sub_f8(montgomery_product_f8(r, r), J), fr_dbl(V));
    let S1J = montgomery_product_f8(S1, J);
    let Y3 = fr_sub_f8(montgomery_product_f8(r, fr_sub_f8(V, X3)), fr_dbl(S1J));
    let ZpZ = fr_add_f8(p1.z, p2.z);
    let Z3 = montgomery_product_f8(fr_sub_f8(fr_sub_f8(montgomery_product_f8(ZpZ, ZpZ), Z1Z1), Z2Z2), H);
    return Jac(X3, Y3, Z3);
}
fn jac_add(dst: Jac, src: Jac) -> Jac {
    let sum = jac_add_raw(dst, src);
    let si = is_zero_f8(src.z);
    let di = is_zero_f8(dst.z);
    var rx = fr_sel(sum.x, src.x, di); var ry = fr_sel(sum.y, src.y, di); var rz = fr_sel(sum.z, src.z, di);
    rx = fr_sel(rx, dst.x, si); ry = fr_sel(ry, dst.y, si); rz = fr_sel(rz, dst.z, si);
    return Jac(rx, ry, rz);
}

// seg_buf layout: two planes of (num_windows*G) Jacobian points, 6 vec4 each.
// plane 0 = segTotal, plane 1 = segLocalW. slot = w*G + s.
fn seg_store(slot: u32, plane: u32, p: Jac) {
    let b = 6u * (plane * cparams.y * sparams.x + slot);
    seg_buf[b + 0u] = vec4<u32>(p.x[0], p.x[1], p.x[2], p.x[3]);
    seg_buf[b + 1u] = vec4<u32>(p.x[4], p.x[5], p.x[6], p.x[7]);
    seg_buf[b + 2u] = vec4<u32>(p.y[0], p.y[1], p.y[2], p.y[3]);
    seg_buf[b + 3u] = vec4<u32>(p.y[4], p.y[5], p.y[6], p.y[7]);
    seg_buf[b + 4u] = vec4<u32>(p.z[0], p.z[1], p.z[2], p.z[3]);
    seg_buf[b + 5u] = vec4<u32>(p.z[4], p.z[5], p.z[6], p.z[7]);
}
fn seg_load(slot: u32, plane: u32) -> Jac {
    let b = 6u * (plane * cparams.y * sparams.x + slot);
    let x0 = seg_buf[b + 0u]; let x1 = seg_buf[b + 1u];
    let y0 = seg_buf[b + 2u]; let y1 = seg_buf[b + 3u];
    let z0 = seg_buf[b + 4u]; let z1 = seg_buf[b + 5u];
    return Jac(
        array<u32, 8>(x0.x, x0.y, x0.z, x0.w, x1.x, x1.y, x1.z, x1.w),
        array<u32, 8>(y0.x, y0.y, y0.z, y0.w, y1.x, y1.y, y1.z, y1.w),
        array<u32, 8>(z0.x, z0.y, z0.z, z0.w, z1.x, z1.y, z1.z, z1.w));
}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let M = cparams.x;
    let num_windows = cparams.y;
    let stride = cparams.z;
    let phase = cparams.w;
    let G = sparams.x;
    let m = sparams.y;
    let log2m = sparams.z;
    let R = get_r_f8();

    if (phase == 0u) {
        // COARSE: one thread per (window, segment).
        let idx = gid.x;
        if (idx >= num_windows * G) { return; }
        let w = idx / G;
        let s = idx % G;
        let seg_base = w * stride + s * m;
        var S: Jac = jac_inf();
        var Wacc: Jac = jac_inf();
        for (var ii: u32 = 0u; ii < m; ii = ii + 1u) {
            let i = m - 1u - ii;
            let slot = seg_base + i;
            let present = is_present[slot] != 0u;
            let z = fr_sel(array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u), R, present);
            let P = Jac(load_x(slot, M), load_y(slot, M), z);
            S = jac_add(S, P);
            Wacc = jac_add(Wacc, S);
        }
        seg_store(w * G + s, 0u, S);
        seg_store(w * G + s, 1u, Wacc);
    } else {
        // FINE: one thread per window.
        let w = gid.x;
        if (w >= num_windows) { return; }
        // CoarseW = Sum_{s=1..G-1} suffixTotal[s] (suffix running-sum, s high->low).
        var ST: Jac = jac_inf();
        var CW: Jac = jac_inf();
        for (var k: u32 = 0u; k < G - 1u; k = k + 1u) {
            let s = G - 1u - k;
            ST = jac_add(ST, seg_load(w * G + s, 0u));
            CW = jac_add(CW, ST);
        }
        // FineSum = Sum_{s=0..G-1} segLocalW[s].
        var FS: Jac = jac_inf();
        for (var s: u32 = 0u; s < G; s = s + 1u) {
            FS = jac_add(FS, seg_load(w * G + s, 1u));
        }
        // W = m*CoarseW + FineSum.
        var mCW: Jac = CW;
        for (var d: u32 = 0u; d < log2m; d = d + 1u) { mCW = jac_double(mCW); }
        let Wj: Jac = jac_add(mCW, FS);
        // Jacobian -> affine (Montgomery) into slot w*stride.
        let slot = w * stride;
        if (is_zero_f8(Wj.z)) {
            let zero = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
            store_x(slot, M, zero); store_y(slot, M, zero);
        } else {
            var z20: BigInt = unpack256_to_limbs(Wj.z);
            var zinv20: BigInt = {{ inv_fn }}(z20);
            var Zinv: array<u32, 8> = pack_limbs_to_256(&zinv20);
            let Z2inv = montgomery_product_f8(Zinv, Zinv);
            let Z3inv = montgomery_product_f8(Z2inv, Zinv);
            store_x(slot, M, montgomery_product_f8(Wj.x, Z2inv));
            store_y(slot, M, montgomery_product_f8(Wj.y, Z3inv));
        }
    }
}
