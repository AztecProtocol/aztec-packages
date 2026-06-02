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

// Recursive radix-m bucket reduction (the reformulation, Phase 2b).
//
// Per window W = Sum_{j=0..STRIDE-1} (j+1)*P[j]. Each reduction "pair" carries
// (total, wsum) for a contiguous bucket range, where total = Sum P[j] and
// wsum = Sum (j-base)*P[j] (0-based local weight). Combining m children of
// width w (each child spans w original buckets):
//   parent.total = Sum_c child_c.total
//   parent.wsum  = w*(Sum_c c*child_c.total) + Sum_c child_c.wsum
// The whole reduce is W = root.total + root.wsum (since (j+1) = j + 1).
//
// Crucially every level is PARALLEL over (window x parent): one thread per
// output pair, serial only over the m children. With m small and STRIDE/m^k
// outputs per level, every level stays saturated until the last few — no
// numWindows-thread serial tail (the Phase-2a bottleneck).
//
// The coarse adds read only ORIGINAL buckets (never a doubled point), so they
// are affine-eligible; weight application (the *w) lives in jac_double here.
// This 2b kernel is all-Jacobian to validate; affine coarse is layered next.
//
// phase 0 COARSE : one thread per (window, segment) — m raw buckets -> a pair.
// phase 2 COMBINE: one thread per (window, parent)  — m pairs -> a pair, *w.
// phase 1 FINAL  : one thread per window — root pair -> W -> affine in red_buf.
//
// seg_buf is a ping-pong pair store (src_base/dst_base in vec4 units); a pair
// occupies 12 vec4 (total then wsum, each a Jacobian point = 6 vec4).

const PG: u32 = 2u;
const WG: u32 = {{ workgroup_size }}u;

@group(0) @binding(0) var<storage, read_write> red_buf:    array<vec4<u32>>;
@group(0) @binding(1) var<storage, read>       is_present: array<u32>;
@group(0) @binding(2) var<storage, read_write> seg_buf:    array<vec4<u32>>;
@group(0) @binding(3) var<uniform>             cparams:    vec4<u32>; // (M_red, num_windows, stride, phase)
@group(0) @binding(4) var<uniform>             sparams:    vec4<u32>; // (m, log2w, inN, outN)
@group(0) @binding(5) var<uniform>             bparams:    vec4<u32>; // (src_base, dst_base, _, _)

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
struct Pair { total: Jac, wsum: Jac, }

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

fn pair_store(base: u32, slot: u32, p: Pair) {
    let b = base + 12u * slot;
    seg_buf[b + 0u] = vec4<u32>(p.total.x[0], p.total.x[1], p.total.x[2], p.total.x[3]);
    seg_buf[b + 1u] = vec4<u32>(p.total.x[4], p.total.x[5], p.total.x[6], p.total.x[7]);
    seg_buf[b + 2u] = vec4<u32>(p.total.y[0], p.total.y[1], p.total.y[2], p.total.y[3]);
    seg_buf[b + 3u] = vec4<u32>(p.total.y[4], p.total.y[5], p.total.y[6], p.total.y[7]);
    seg_buf[b + 4u] = vec4<u32>(p.total.z[0], p.total.z[1], p.total.z[2], p.total.z[3]);
    seg_buf[b + 5u] = vec4<u32>(p.total.z[4], p.total.z[5], p.total.z[6], p.total.z[7]);
    seg_buf[b + 6u] = vec4<u32>(p.wsum.x[0], p.wsum.x[1], p.wsum.x[2], p.wsum.x[3]);
    seg_buf[b + 7u] = vec4<u32>(p.wsum.x[4], p.wsum.x[5], p.wsum.x[6], p.wsum.x[7]);
    seg_buf[b + 8u] = vec4<u32>(p.wsum.y[0], p.wsum.y[1], p.wsum.y[2], p.wsum.y[3]);
    seg_buf[b + 9u] = vec4<u32>(p.wsum.y[4], p.wsum.y[5], p.wsum.y[6], p.wsum.y[7]);
    seg_buf[b + 10u] = vec4<u32>(p.wsum.z[0], p.wsum.z[1], p.wsum.z[2], p.wsum.z[3]);
    seg_buf[b + 11u] = vec4<u32>(p.wsum.z[4], p.wsum.z[5], p.wsum.z[6], p.wsum.z[7]);
}
fn jac_from(a: vec4<u32>, b: vec4<u32>, c: vec4<u32>, d: vec4<u32>, e: vec4<u32>, f: vec4<u32>) -> Jac {
    return Jac(
        array<u32, 8>(a.x, a.y, a.z, a.w, b.x, b.y, b.z, b.w),
        array<u32, 8>(c.x, c.y, c.z, c.w, d.x, d.y, d.z, d.w),
        array<u32, 8>(e.x, e.y, e.z, e.w, f.x, f.y, f.z, f.w));
}
fn pair_load(base: u32, slot: u32) -> Pair {
    let b = base + 12u * slot;
    let total = jac_from(seg_buf[b + 0u], seg_buf[b + 1u], seg_buf[b + 2u], seg_buf[b + 3u], seg_buf[b + 4u], seg_buf[b + 5u]);
    let wsum = jac_from(seg_buf[b + 6u], seg_buf[b + 7u], seg_buf[b + 8u], seg_buf[b + 9u], seg_buf[b + 10u], seg_buf[b + 11u]);
    return Pair(total, wsum);
}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let M = cparams.x;
    let num_windows = cparams.y;
    let stride = cparams.z;
    let phase = cparams.w;
    let m = sparams.x;
    let log2w = sparams.y;
    let inN = sparams.z;
    let outN = sparams.w;
    let src_base = bparams.x;
    let dst_base = bparams.y;
    let R = get_r_f8();

    if (phase == 0u) {
        // COARSE: m raw buckets [w*stride + p*m, +m) -> pair (total, wsum_0based).
        let idx = gid.x;
        if (idx >= num_windows * outN) { return; }
        let w = idx / outN;
        let p = idx % outN;
        let seg_base = w * stride + p * m;
        var S: Jac = jac_inf();
        var WS: Jac = jac_inf();
        for (var ii: u32 = 0u; ii < m; ii = ii + 1u) {
            let i = m - 1u - ii;
            let slot = seg_base + i;
            let present = is_present[slot] != 0u;
            let z = fr_sel(array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u), R, present);
            let P = Jac(load_x(slot, M), load_y(slot, M), z);
            S = jac_add(S, P);
            if (i >= 1u) { WS = jac_add(WS, S); }
        }
        pair_store(dst_base, w * outN + p, Pair(S, WS));
    } else if (phase == 2u) {
        // COMBINE: m child pairs -> parent pair, weight w = 2^log2w.
        let idx = gid.x;
        if (idx >= num_windows * outN) { return; }
        let w = idx / outN;
        let p = idx % outN;
        let i0 = p * m;
        var ST: Jac = jac_inf();
        var SccT: Jac = jac_inf();
        var WS: Jac = jac_inf();
        for (var cc: u32 = 0u; cc < m; cc = cc + 1u) {
            let c = m - 1u - cc;
            let ci = i0 + c;
            if (ci >= inN) { continue; }
            let ch = pair_load(src_base, w * inN + ci);
            ST = jac_add(ST, ch.total);
            WS = jac_add(WS, ch.wsum);
            if (c >= 1u) { SccT = jac_add(SccT, ST); }
        }
        var wScc: Jac = SccT;
        for (var d: u32 = 0u; d < log2w; d = d + 1u) { wScc = jac_double(wScc); }
        pair_store(dst_base, w * outN + p, Pair(ST, jac_add(wScc, WS)));
    } else {
        // FINAL: root pair -> W = total + wsum -> affine into slot w*stride.
        let w = gid.x;
        if (w >= num_windows) { return; }
        let root = pair_load(src_base, w);
        let Wj: Jac = jac_add(root.total, root.wsum);
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
