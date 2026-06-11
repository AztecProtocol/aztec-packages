{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> bigint_by_funcs }}
{{> inverse_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

{{> field8_funcs }}

// Halving-reduction finalize: one small workgroup per window tree-reduces
// the staged points (unscaled weighted partial at the arena base, scaled
// carry totals at base + B>>j) with COMPLETE additions — global in-place
// over a baked offset pairing, storageBarrier() between rounds, no
// workgroup memory — then lane 0 normalises the root to affine in the
// same dispatch (replacing the separate jac-finalize pass).

const PG: u32 = 2u;
const WG: u32 = {{ workgroup_size }}u;

@group(0) @binding(0) var<storage, read_write> red_buf:    array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> red_z:      array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> is_present: array<u32>;
@group(0) @binding(3) var<uniform>             cparams:    vec4<u32>;
@group(0) @binding(4) var<uniform>             lparams:    vec4<u32>;
@group(0) @binding(5) var<storage, read>       hsched:     array<vec4<u32>>;
// cparams = (M_RED, _, _, num_windows); lparams unused (geometry baked).

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
fn fr_is_zero_f8(a: array<u32, 8>) -> bool {
    return (a[0] | a[1] | a[2] | a[3] | a[4] | a[5] | a[6] | a[7]) == 0u;
}
fn fr_dbl_f8(a: array<u32, 8>) -> array<u32, 8> { return fr_add_f8(a, a); }

struct Jac { x: array<u32, 8>, y: array<u32, 8>, z: array<u32, 8>, }

fn jac_cdbl(p: Jac) -> Jac {
    if (fr_is_zero_f8(p.z)) { return p; }
    let A = montgomery_product_f8(p.x, p.x);
    let Bf = montgomery_product_f8(p.y, p.y);
    let Cf = montgomery_product_f8(Bf, Bf);
    let XpB = fr_add_f8(p.x, Bf);
    let s2 = fr_sub_f8(montgomery_product_f8(XpB, XpB), fr_add_f8(A, Cf));
    let Df = fr_dbl_f8(s2);
    let E = fr_add_f8(fr_dbl_f8(A), A);
    let F = montgomery_product_f8(E, E);
    let X3 = fr_sub_f8(F, fr_dbl_f8(Df));
    let C8 = fr_dbl_f8(fr_dbl_f8(fr_dbl_f8(Cf)));
    let Y3 = fr_sub_f8(montgomery_product_f8(E, fr_sub_f8(Df, X3)), C8);
    let Z3 = fr_dbl_f8(montgomery_product_f8(p.y, p.z));
    return Jac(X3, Y3, Z3);
}

fn jac_cadd(p: Jac, q: Jac) -> Jac {
    if (fr_is_zero_f8(q.z)) { return p; }
    if (fr_is_zero_f8(p.z)) { return q; }
    let Z1Z1 = montgomery_product_f8(p.z, p.z);
    let Z2Z2 = montgomery_product_f8(q.z, q.z);
    let U1 = montgomery_product_f8(p.x, Z2Z2);
    let U2 = montgomery_product_f8(q.x, Z1Z1);
    let S1 = montgomery_product_f8(montgomery_product_f8(p.y, q.z), Z2Z2);
    let S2 = montgomery_product_f8(montgomery_product_f8(q.y, p.z), Z1Z1);
    if (fr_eq_f8(U1, U2)) {
        if (fr_eq_f8(S1, S2)) {
            return jac_cdbl(p);
        }
        return Jac(p.x, p.y, array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u));
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
    let ZpZ = fr_add_f8(p.z, q.z);
    let Z3 = montgomery_product_f8(fr_sub_f8(fr_sub_f8(montgomery_product_f8(ZpZ, ZpZ), Z1Z1), Z2Z2), H);
    return Jac(X3, Y3, Z3);
}

fn gload(idx: u32) -> Jac {
    return Jac(load_x(idx, cparams.x), load_y(idx, cparams.x), load_zp(idx));
}
fn gstore(idx: u32, v: Jac) {
    store_x(idx, cparams.x, v.x);
    store_y(idx, cparams.x, v.y);
    store_z(idx, v.z);
}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(workgroup_id) wgid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
    let w = wgid.y;
    let t = lid.x;
    let h = hsched[w];
    let base = h.x;

{{{ f2_body }}}

    if (t == 0u) {
        let Z = load_zp(base);
        if (fr_is_zero_f8(Z)) {
            let z8 = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
            store_x(base, cparams.x, z8);
            store_y(base, cparams.x, z8);
            is_present[base] = 0u;
        } else {
            let X = load_x(base, cparams.x);
            let Y = load_y(base, cparams.x);
            var Zinv: array<u32, 8> = {{ inv_fn }}(Z);
            let Z2inv = montgomery_product_f8(Zinv, Zinv);
            let Z3inv = montgomery_product_f8(Z2inv, Zinv);
            store_x(base, cparams.x, montgomery_product_f8(X, Z2inv));
            store_y(base, cparams.x, montgomery_product_f8(Y, Z3inv));
            is_present[base] = 1u;
        }
    }

    {{{ recompile }}}
}
