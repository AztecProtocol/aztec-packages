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

// Segmented-global bucket reduce, phase 1 (reliable replacement for the
// flaky cooperative shared-memory reduce). One thread per (window, segment):
// a serial running-sum over its SS contiguous buckets (acc += B[i]; ws += acc,
// 2*SS adds, no doublings) -> the segment's (seg_tot, seg_ws) Jacobian pair,
// written to the global seg_buf. No shared memory, no barriers, so none of the
// M2/Metal threadgroup-array-of-arrays flakiness; phase 2 combines the G
// partials per window.

const PG: u32 = 2u;
const STRIDE: u32 = {{ stride }}u;
const SS: u32 = {{ ss }}u;   // buckets per segment
const G: u32 = {{ g }}u;     // segments per window

@group(0) @binding(0) var<storage, read>       red_buf:    array<vec4<u32>>;
@group(0) @binding(1) var<storage, read>       is_present: array<u32>;
@group(0) @binding(2) var<storage, read_write> seg_buf:    array<vec4<u32>>;
@group(0) @binding(3) var<uniform>             params:     vec4<u32>;
// params = (M (red_buf element stride), num_windows, _, _)

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
// seg_buf layout: partial p occupies 12 vec4 = (tot.x, tot.y, tot.z, ws.x,
// ws.y, ws.z), each coord 2 vec4 (8 u32).
fn seg_put(at: u32, v: array<u32, 8>) {
    seg_buf[at + 0u] = vec4<u32>(v[0], v[1], v[2], v[3]);
    seg_buf[at + 1u] = vec4<u32>(v[4], v[5], v[6], v[7]);
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

fn jac_add_raw(p1: Jac, p2: Jac) -> Jac {
    let Z1Z1 = montgomery_product_f8(p1.z, p1.z);
    let Z2Z2 = montgomery_product_f8(p2.z, p2.z);
    let U1 = montgomery_product_f8(p1.x, Z2Z2);
    let U2 = montgomery_product_f8(p2.x, Z1Z1);
    let S1 = montgomery_product_f8(montgomery_product_f8(p1.y, p2.z), Z2Z2);
    let S2 = montgomery_product_f8(montgomery_product_f8(p2.y, p1.z), Z1Z1);
    let H = fr_sub_f8(U2, U1);
    let twoH = fr_dbl_f8(H);
    let I = montgomery_product_f8(twoH, twoH);
    let J = montgomery_product_f8(H, I);
    let r = fr_dbl_f8(fr_sub_f8(S2, S1));
    let V = montgomery_product_f8(U1, I);
    let X3 = fr_sub_f8(fr_sub_f8(montgomery_product_f8(r, r), J), fr_dbl_f8(V));
    let S1J = montgomery_product_f8(S1, J);
    let Y3 = fr_sub_f8(montgomery_product_f8(r, fr_sub_f8(V, X3)), fr_dbl_f8(S1J));
    let ZpZ = fr_add_f8(p1.z, p2.z);
    let Z3 = montgomery_product_f8(fr_sub_f8(fr_sub_f8(montgomery_product_f8(ZpZ, ZpZ), Z1Z1), Z2Z2), H);
    return Jac(X3, Y3, Z3);
}

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
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let p = gid.x;   // partial index = w*G + seg
    let M = params.x;
    let num_windows = params.y;
    if (p >= num_windows * G) { return; }
    let w = p / G;
    let seg = p % G;
    let base = w * STRIDE;
    let seg_start = seg * SS;
    let zero = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);

    var acc = Jac(zero, zero, zero);   // running suffix sum within the segment
    var ws = Jac(zero, zero, zero);    // running weighted sum (local weights 1..SS)
    var local: u32 = SS;
    loop {
        if (local == 0u) { break; }
        local = local - 1u;
        let slot = base + seg_start + local;
        var bz = zero;
        if (is_present[slot] != 0u) { bz = get_r_f8(); }
        let b = Jac(load_x(slot, M), load_y(slot, M), bz);
        acc = jac_add(acc, b);
        ws = jac_add(ws, acc);
    }

    let pb = p * 12u;
    seg_put(pb + 0u, acc.x); seg_put(pb + 2u, acc.y); seg_put(pb + 4u, acc.z);
    seg_put(pb + 6u, ws.x);  seg_put(pb + 8u, ws.y);  seg_put(pb + 10u, ws.z);
}
