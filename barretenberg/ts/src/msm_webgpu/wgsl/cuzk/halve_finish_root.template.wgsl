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
// carry totals at base + B>>j) with COMPLETE additions in workgroup
// memory, workgroupBarrier() between rolled rounds — then lane 0 writes
// the root back and normalises it to affine in the same dispatch
// (replacing the separate jac-finalize pass).

const PG: u32 = 2u;
const WG: u32 = {{ workgroup_size }}u;

@group(0) @binding(0) var<storage, read_write> red_buf:    array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> red_z:      array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> is_present: array<u32>;
@group(0) @binding(3) var<uniform>             cparams:    vec4<u32>;
@group(0) @binding(4) var<uniform>             lparams:    vec4<u32>;
@group(0) @binding(5) var<storage, read>       hsched:     array<vec4<u32>>;
// cparams = (M_RED, _, _, num_windows);
// lparams = (finisher_depth, inputs_jac, log2_B, 0) — uniform-sourced so the
// rolled tree's barrier sits in uniform control flow.

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



fn gload(idx: u32) -> Jac {
    return Jac(load_x(idx, cparams.x), load_y(idx, cparams.x), load_zp(idx));
}
fn gstore(idx: u32, v: Jac) {
    store_x(idx, cparams.x, v.x);
    store_y(idx, cparams.x, v.y);
    store_z(idx, v.z);
}

// Workgroup-shared staging for the per-window tree: cooperative reduction
// synchronizes through workgroup memory + workgroupBarrier() (storage-buffer
// writes are NOT reliably visible across a workgroup on mobile drivers).
// Flat SCALAR u32 element type — every phone-proven kernel stores scalars
// in workgroup memory; composite array<u32,8> copies at dynamic LDS indices
// are untrodden driver ground.
var<workgroup> sh: array<u32, {{ sh_words }}>;

fn sl_x(i: u32) -> array<u32, 8> {
    let b = 24u * i;
    return array<u32, 8>(sh[b], sh[b + 1u], sh[b + 2u], sh[b + 3u], sh[b + 4u], sh[b + 5u], sh[b + 6u], sh[b + 7u]);
}
fn sl_y(i: u32) -> array<u32, 8> {
    let b = 24u * i + 8u;
    return array<u32, 8>(sh[b], sh[b + 1u], sh[b + 2u], sh[b + 3u], sh[b + 4u], sh[b + 5u], sh[b + 6u], sh[b + 7u]);
}
fn sl_z(i: u32) -> array<u32, 8> {
    let b = 24u * i + 16u;
    return array<u32, 8>(sh[b], sh[b + 1u], sh[b + 2u], sh[b + 3u], sh[b + 4u], sh[b + 5u], sh[b + 6u], sh[b + 7u]);
}
fn ss_x(i: u32, v: array<u32, 8>) {
    let b = 24u * i;
    for (var c = 0u; c < 8u; c = c + 1u) { sh[b + c] = v[c]; }
}
fn ss_y(i: u32, v: array<u32, 8>) {
    let b = 24u * i + 8u;
    for (var c = 0u; c < 8u; c = c + 1u) { sh[b + c] = v[c]; }
}
fn ss_z(i: u32, v: array<u32, 8>) {
    let b = 24u * i + 16u;
    for (var c = 0u; c < 8u; c = c + 1u) { sh[b + c] = v[c]; }
}
fn sload(i: u32) -> Jac {
    return Jac(sl_x(i), sl_y(i), sl_z(i));
}
fn sstore(i: u32, v: Jac) {
    ss_x(i, v.x);
    ss_y(i, v.y);
    ss_z(i, v.z);
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
