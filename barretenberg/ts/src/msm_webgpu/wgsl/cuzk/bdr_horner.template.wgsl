{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

{{> field8_funcs }}

// Bit-decomposition Horner — combine the c per-window G values (c-1 tree
// roots + B[N] lifted for j=c-1) into L_w via
//   acc = G[c-1]; for j = c-2..0: acc = 2 * acc + G[j].
// One thread per window. NW threads total — tiny dispatch but each
// thread does c-1 doublings + c-1 adds (~14 jac operations for c=8).
//
// G values come from g_buf (3 planes × NW*(c-1)) + meta. G[c-1] comes
// from bucket_result column N for window w.
// Output L_w goes into out_buf's W planes (3, 4, 5 of the 6-plane SoA)
// at slot w; the matching presence bit lands in out_meta[w]. This is
// the same layout the JBR path produces, so the host gather code is
// unchanged.

const PG: u32 = 2u;

@group(0) @binding(0) var<storage, read>       g_buf:         array<vec4<u32>>;
@group(0) @binding(1) var<storage, read>       g_meta:        array<u32>;
@group(0) @binding(2) var<storage, read>       bucket_result: array<vec4<u32>>;
@group(0) @binding(3) var<storage, read_write> out_buf:       array<vec4<u32>>;
@group(0) @binding(4) var<storage, read_write> out_meta:      array<u32>;
@group(0) @binding(5) var<uniform>             params:        vec4<u32>;
// params.x = num_windows (NW)
// params.y = trees_per_window (= c - 1)
// params.z = bw (bucket_result stride per window)
// params.w = out_w_plane_base (= 3 * out_plane_stride; offset of W.X plane in field-elements)

@group(0) @binding(6) var<uniform>             params2:       vec4<u32>;
// params2.x = b_total (= NW * bw, bucket_result y-plane offset)
// params2.y = bucket_n_col (= 2^(c-1) = N, 1-indexed column of B[N])
// params2.z = g_plane_stride (= NW * (c-1), field-elements per g_buf plane)
// params2.w = out_plane_stride (= NW, field-elements per out_buf plane)

fn load_aff_x(idx: u32) -> array<u32, 8> {
    let base = PG * idx;
    let q0 = bucket_result[base + 0u];
    let q1 = bucket_result[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn load_aff_y(idx: u32, b_total: u32) -> array<u32, 8> {
    let base = PG * b_total + PG * idx;
    let q0 = bucket_result[base + 0u];
    let q1 = bucket_result[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn load_g(plane_base: u32, idx: u32) -> array<u32, 8> {
    let base = PG * plane_base + PG * idx;
    let q0 = g_buf[base + 0u];
    let q1 = g_buf[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn store_out(plane_base: u32, w: u32, val: array<u32, 8>) {
    let base = PG * plane_base + PG * w;
    out_buf[base + 0u] = vec4<u32>(val[0], val[1], val[2], val[3]);
    out_buf[base + 1u] = vec4<u32>(val[4], val[5], val[6], val[7]);
}

fn is_aff_zero(x: array<u32, 8>, y: array<u32, 8>) -> bool {
    return is_zero_f8(x) && is_zero_f8(y);
}

fn jac_double(
    x: array<u32, 8>, y: array<u32, 8>, z: array<u32, 8>,
) -> array<array<u32, 8>, 3> {
    let a:  array<u32, 8> = montgomery_product_f8(x, x);
    let b:  array<u32, 8> = montgomery_product_f8(y, y);
    let c:  array<u32, 8> = montgomery_product_f8(b, b);
    let xb: array<u32, 8> = fr_add_f8(x, b);
    let xb2: array<u32, 8> = montgomery_product_f8(xb, xb);
    let d:  array<u32, 8> = fr_add_f8(fr_sub_f8(fr_sub_f8(xb2, a), c),
                                      fr_sub_f8(fr_sub_f8(xb2, a), c));
    let twoa: array<u32, 8> = fr_add_f8(a, a);
    let e:  array<u32, 8> = fr_add_f8(twoa, a);
    let f:  array<u32, 8> = montgomery_product_f8(e, e);
    let x3: array<u32, 8> = fr_sub_f8(f, fr_add_f8(d, d));
    let edx3: array<u32, 8> = montgomery_product_f8(e, fr_sub_f8(d, x3));
    let twoc: array<u32, 8> = fr_add_f8(c, c);
    let fourc: array<u32, 8> = fr_add_f8(twoc, twoc);
    let eightc: array<u32, 8> = fr_add_f8(fourc, fourc);
    let y3: array<u32, 8> = fr_sub_f8(edx3, eightc);
    let yz: array<u32, 8> = fr_add_f8(y, z);
    let yz2: array<u32, 8> = montgomery_product_f8(yz, yz);
    let zz: array<u32, 8> = montgomery_product_f8(z, z);
    let z3: array<u32, 8> = fr_sub_f8(fr_sub_f8(yz2, b), zz);
    return array<array<u32, 8>, 3>(x3, y3, z3);
}

fn jac_add(
    x1: array<u32, 8>, y1: array<u32, 8>, z1: array<u32, 8>,
    x2: array<u32, 8>, y2: array<u32, 8>, z2: array<u32, 8>,
) -> array<array<u32, 8>, 3> {
    let z1z1 = montgomery_product_f8(z1, z1);
    let z2z2 = montgomery_product_f8(z2, z2);
    let u1 = montgomery_product_f8(x1, z2z2);
    let u2 = montgomery_product_f8(x2, z1z1);
    let s1 = montgomery_product_f8(montgomery_product_f8(y1, z2), z2z2);
    let s2 = montgomery_product_f8(montgomery_product_f8(y2, z1), z1z1);
    let h = fr_sub_f8(u2, u1);
    let twoh = fr_add_f8(h, h);
    let i = montgomery_product_f8(twoh, twoh);
    let j = montgomery_product_f8(h, i);
    let r = fr_add_f8(fr_sub_f8(s2, s1), fr_sub_f8(s2, s1));
    let v = montgomery_product_f8(u1, i);
    let r2 = montgomery_product_f8(r, r);
    var x3 = fr_sub_f8(r2, j);
    x3 = fr_sub_f8(x3, fr_add_f8(v, v));
    let rvx3 = montgomery_product_f8(r, fr_sub_f8(v, x3));
    let s1j = montgomery_product_f8(s1, j);
    let y3 = fr_sub_f8(rvx3, fr_add_f8(s1j, s1j));
    let zsum = fr_add_f8(z1, z2);
    let zsum2 = montgomery_product_f8(zsum, zsum);
    let z3 = montgomery_product_f8(fr_sub_f8(fr_sub_f8(zsum2, z1z1), z2z2), h);
    return array<array<u32, 8>, 3>(x3, y3, z3);
}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let w = gid.x;
    let nw = params.x;
    if (w >= nw) {
        return;
    }
    let trees_per_window = params.y;
    let bw = params.z;
    let out_w_plane_base = params.w;
    let b_total = params2.x;
    let bucket_n_col = params2.y;
    let g_plane_stride = params2.z;
    let out_plane_stride = params2.w;

    // Lift B[N] for j = c-1 as the Horner seed.
    let n_idx = w * bw + bucket_n_col;
    let bnx = load_aff_x(n_idx);
    let bny = load_aff_y(n_idx, b_total);
    let bn_present = !is_aff_zero(bnx, bny);

    var acc_x: array<u32, 8> = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
    var acc_y: array<u32, 8> = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
    var acc_z: array<u32, 8> = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
    var acc_pres: bool = false;
    if (bn_present) {
        acc_x = bnx;
        acc_y = bny;
        acc_z = get_r_f8();
        acc_pres = true;
    }

    // Horner from high bit to low. The g_buf carries trees j = 0..(c-2),
    // laid out per-window-then-per-bit: G[w, j] at index (w * (c-1) + j).
    for (var jj: u32 = trees_per_window; jj > 0u; jj = jj - 1u) {
        let j = jj - 1u;
        let g_idx = w * trees_per_window + j;
        let g_pres = (g_meta[g_idx] & 1u) != 0u;
        let gx = load_g(0u * g_plane_stride, g_idx);
        let gy = load_g(1u * g_plane_stride, g_idx);
        let gz = load_g(2u * g_plane_stride, g_idx);

        // acc = 2 * acc (skip if acc is inf)
        if (acc_pres) {
            let dd = jac_double(acc_x, acc_y, acc_z);
            acc_x = dd[0]; acc_y = dd[1]; acc_z = dd[2];
        }
        // acc = acc + G[j] (safe-add for both possibly-inf sides)
        if (g_pres) {
            if (!acc_pres) {
                acc_x = gx; acc_y = gy; acc_z = gz;
                acc_pres = true;
            } else {
                let s = jac_add(acc_x, acc_y, acc_z, gx, gy, gz);
                acc_x = s[0]; acc_y = s[1]; acc_z = s[2];
            }
        }
    }

    store_out(out_w_plane_base + 0u * out_plane_stride, w, acc_x);
    store_out(out_w_plane_base + 1u * out_plane_stride, w, acc_y);
    store_out(out_w_plane_base + 2u * out_plane_stride, w, acc_z);
    out_meta[w] = select(0u, 1u, acc_pres);

    {{{ recompile }}}
}
