{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

{{> field8_funcs }}

// One depth of the halving bucket reduction in the thread-starved regime:
// one Jacobian pair-addition per thread at maximum width. Runs after a
// z-plane init (every present slot carries a valid z, r1 for points still
// affine), so mixed affine/Jacobian arrays need no special cases. The add
// is COMPLETE: H == 0 routes to the doubling formula (S1 == S2) or to
// infinity (S1 == −S1 … i.e. otherwise) — the comparison reuses values the
// add formula computes anyway.

const PG: u32 = 2u;
const WG: u32 = {{ workgroup_size }}u;

@group(0) @binding(0) var<storage, read_write> red_buf:    array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> red_z:      array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> is_present: array<u32>;
@group(0) @binding(3) var<uniform>             cparams:    vec4<u32>;
@group(0) @binding(4) var<uniform>             lparams:    vec4<u32>;
@group(0) @binding(5) var<storage, read>       hsched:     array<vec4<u32>>;
// cparams = (M_RED, _, _, _); lparams = (depth, 0, 0, 0);
// hsched[w] = (base, B, 0, 0).

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

fn fr_eq_f8(a: array<u32, 8>, b: array<u32, 8>) -> bool {
    return a[0] == b[0] && a[1] == b[1] && a[2] == b[2] && a[3] == b[3] &&
           a[4] == b[4] && a[5] == b[5] && a[6] == b[6] && a[7] == b[7];
}

fn fr_dbl_f8(a: array<u32, 8>) -> array<u32, 8> { return fr_add_f8(a, a); }

fn arena_off(B: u32, a: u32) -> u32 {
    return select(B >> a, 0u, a == 0u);
}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(workgroup_id) wgid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
    let w = wgid.y;
    let q = wgid.x * WG + lid.x;
    let M_RED = cparams.x;
    let d = lparams.x;
    let h = hsched[w];
    let base = h.x;
    let B = h.y;
    let L = B >> d;
    let half = L >> 1u;
    let pairs = (1u + d) * half;
    if (q >= pairs) {
        return;
    }
    let hshift = firstTrailingBit(half);
    let a = q >> hshift;
    let dst = base + arena_off(B, a) + (q & (half - 1u));
    let src = dst + half;
    let pd = is_present[dst] != 0u;
    let ps = is_present[src] != 0u;
    if (!ps) {
        return; // src absent: dst unchanged, nothing to write
    }
    let xs = load_x(src, M_RED);
    let ys = load_y(src, M_RED);
    let zs = load_zp(src);
    if (!pd) {
        // dst absent: copy src.
        store_x(dst, M_RED, xs);
        store_y(dst, M_RED, ys);
        store_z(dst, zs);
        is_present[dst] = 1u;
        return;
    }
    let xd = load_x(dst, M_RED);
    let yd = load_y(dst, M_RED);
    let zd = load_zp(dst);

    // add-2007-bl, completed: H == 0 → double (S1 == S2) or infinity.
    let Z1Z1 = montgomery_product_f8(zd, zd);
    let Z2Z2 = montgomery_product_f8(zs, zs);
    let U1 = montgomery_product_f8(xd, Z2Z2);
    let U2 = montgomery_product_f8(xs, Z1Z1);
    let S1 = montgomery_product_f8(montgomery_product_f8(yd, zs), Z2Z2);
    let S2 = montgomery_product_f8(montgomery_product_f8(ys, zd), Z1Z1);
    if (fr_eq_f8(U1, U2)) {
        if (fr_eq_f8(S1, S2)) {
            // dbl-2009-l on dst.
            let A = montgomery_product_f8(xd, xd);
            let Bf = montgomery_product_f8(yd, yd);
            let Cf = montgomery_product_f8(Bf, Bf);
            let XpB = fr_add_f8(xd, Bf);
            let s2 = fr_sub_f8(montgomery_product_f8(XpB, XpB), fr_add_f8(A, Cf));
            let Df = fr_dbl_f8(s2);
            let E = fr_add_f8(fr_dbl_f8(A), A);
            let F = montgomery_product_f8(E, E);
            let X3 = fr_sub_f8(F, fr_dbl_f8(Df));
            let C8 = fr_dbl_f8(fr_dbl_f8(fr_dbl_f8(Cf)));
            let Y3 = fr_sub_f8(montgomery_product_f8(E, fr_sub_f8(Df, X3)), C8);
            let Z3 = fr_dbl_f8(montgomery_product_f8(yd, zd));
            store_x(dst, M_RED, X3);
            store_y(dst, M_RED, Y3);
            store_z(dst, Z3);
        } else {
            is_present[dst] = 0u;
        }
        return;
    }
    let H = fr_sub_f8(U2, U1);
    let twoH = fr_dbl_f8(H);
    let I = montgomery_product_f8(twoH, twoH);
    let J = montgomery_product_f8(H, I);
    let r = fr_dbl_f8(fr_sub_f8(S2, S1));
    let V = montgomery_product_f8(U1, I);
    let X3 = fr_sub_f8(fr_sub_f8(montgomery_product_f8(r, r), J), fr_dbl_f8(V));
    let S1J = montgomery_product_f8(S1, J);
    let Y3 = fr_sub_f8(montgomery_product_f8(r, fr_sub_f8(V, X3)), fr_dbl_f8(S1J));
    let ZpZ = fr_add_f8(zd, zs);
    let Z3 = montgomery_product_f8(fr_sub_f8(fr_sub_f8(montgomery_product_f8(ZpZ, ZpZ), Z1Z1), Z2Z2), H);
    store_x(dst, M_RED, X3);
    store_y(dst, M_RED, Y3);
    store_z(dst, Z3);

    {{{ recompile }}}
}
