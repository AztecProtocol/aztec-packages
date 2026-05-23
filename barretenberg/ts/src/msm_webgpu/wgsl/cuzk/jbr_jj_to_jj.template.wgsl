{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

{{> field8_funcs }}

// Bucket-reduction round r >= 1: Jacobian + Jacobian -> Jacobian (S, W).
//
// Each (S, W) tree node summarises a contiguous range of buckets:
//   S = Σ B[k] over the range,
//   W = Σ (pos·B[k]) with pos = 1..h relative to the range start, h = size.
// Merge two adjacent (S_L, W_L) and (S_R, W_R) of size h each into one
// (S, W) of size 2h:
//   S    = S_L + S_R                       (1 JJ add)
//   hS_R = double S_R, l = log2(h) times   (l Jacobian doublings)
//   W    = W_L + hS_R + W_R                (2 JJ adds)
// One output thread per merge — no x1 == x2 branch (the algorithm is
// SRS-only: randomly-independent generators never collide).
//
// Layout: 6 planes [S.X, S.Y, S.Z, W.X, W.Y, W.Z] in a single buffer.
// Each plane is `plane_stride` field-elements wide, packed PG = 2 vec4
// per field-element. Both in_buf and out_buf share this shape; the host
// passes the in / out plane strides separately.

const PG: u32 = 2u;

@group(0) @binding(0) var<storage, read>       in_buf:  array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> out_buf: array<vec4<u32>>;
@group(0) @binding(2) var<uniform>             params:  vec4<u32>;
// params.x = M_out_pairs (output node count this round)
// params.y = in_plane_stride (field-elements per plane in in_buf)
// params.z = out_plane_stride (field-elements per plane in out_buf)
// params.w = num_doublings (= log2(h), where h = size of each input child)

fn load_plane(buf_offset: u32, node: u32) -> array<u32, 8> {
    let base = PG * buf_offset + PG * node;
    let q0 = in_buf[base + 0u];
    let q1 = in_buf[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn store_plane(buf_offset: u32, node: u32, val: array<u32, 8>) {
    let base = PG * buf_offset + PG * node;
    out_buf[base + 0u] = vec4<u32>(val[0], val[1], val[2], val[3]);
    out_buf[base + 1u] = vec4<u32>(val[4], val[5], val[6], val[7]);
}

// Jacobian doubling (a = 0, dbl-2009-l). Z != 0 always (the algorithm
// never produces the point at infinity within an SRS basis).
fn jac_double(
    x: array<u32, 8>, y: array<u32, 8>, z: array<u32, 8>,
) -> array<array<u32, 8>, 3> {
    let a:  array<u32, 8> = montgomery_product_f8(x, x);          // A = X^2
    let b:  array<u32, 8> = montgomery_product_f8(y, y);          // B = Y^2
    let c:  array<u32, 8> = montgomery_product_f8(b, b);          // C = B^2
    let xb: array<u32, 8> = fr_add_f8(x, b);                      // X + B
    let xb2: array<u32, 8> = montgomery_product_f8(xb, xb);       // (X + B)^2
    let xb2a: array<u32, 8> = fr_sub_f8(xb2, a);
    let dpre: array<u32, 8> = fr_sub_f8(xb2a, c);                 // (X+B)^2 - A - C
    let d:  array<u32, 8> = fr_add_f8(dpre, dpre);                // D = 2 * (...)
    let twoa: array<u32, 8> = fr_add_f8(a, a);
    let e:  array<u32, 8> = fr_add_f8(twoa, a);                   // E = 3 * A
    let f:  array<u32, 8> = montgomery_product_f8(e, e);          // F = E^2
    let twod: array<u32, 8> = fr_add_f8(d, d);
    let x3: array<u32, 8> = fr_sub_f8(f, twod);                   // X3 = F - 2D
    let dx3: array<u32, 8> = fr_sub_f8(d, x3);
    let edx3: array<u32, 8> = montgomery_product_f8(e, dx3);
    let twoc: array<u32, 8> = fr_add_f8(c, c);
    let fourc: array<u32, 8> = fr_add_f8(twoc, twoc);
    let eightc: array<u32, 8> = fr_add_f8(fourc, fourc);
    let y3: array<u32, 8> = fr_sub_f8(edx3, eightc);              // Y3 = E*(D-X3) - 8C
    let yz: array<u32, 8> = fr_add_f8(y, z);
    let yz2: array<u32, 8> = montgomery_product_f8(yz, yz);
    let yz2b: array<u32, 8> = fr_sub_f8(yz2, b);
    let zz: array<u32, 8> = montgomery_product_f8(z, z);
    let z3: array<u32, 8> = fr_sub_f8(yz2b, zz);                  // Z3 = (Y+Z)^2 - B - Z^2
    return array<array<u32, 8>, 3>(x3, y3, z3);
}

// Jacobian + Jacobian add (a = 0, add-2007-bl). Both Z's nonzero, no
// equality check (algorithm precludes coordinate collisions).
fn jac_add(
    x1: array<u32, 8>, y1: array<u32, 8>, z1: array<u32, 8>,
    x2: array<u32, 8>, y2: array<u32, 8>, z2: array<u32, 8>,
) -> array<array<u32, 8>, 3> {
    let z1z1: array<u32, 8> = montgomery_product_f8(z1, z1);            // Z1^2
    let z2z2: array<u32, 8> = montgomery_product_f8(z2, z2);            // Z2^2
    let u1: array<u32, 8> = montgomery_product_f8(x1, z2z2);            // X1 * Z2^2
    let u2: array<u32, 8> = montgomery_product_f8(x2, z1z1);            // X2 * Z1^2
    let y1z2: array<u32, 8> = montgomery_product_f8(y1, z2);
    let s1: array<u32, 8> = montgomery_product_f8(y1z2, z2z2);          // Y1 * Z2 * Z2^2
    let y2z1: array<u32, 8> = montgomery_product_f8(y2, z1);
    let s2: array<u32, 8> = montgomery_product_f8(y2z1, z1z1);          // Y2 * Z1 * Z1^2
    let h: array<u32, 8> = fr_sub_f8(u2, u1);                           // H = U2 - U1
    let twoh: array<u32, 8> = fr_add_f8(h, h);
    let i: array<u32, 8> = montgomery_product_f8(twoh, twoh);           // I = (2H)^2
    let j: array<u32, 8> = montgomery_product_f8(h, i);                 // J = H * I
    let rdiff: array<u32, 8> = fr_sub_f8(s2, s1);
    let r: array<u32, 8> = fr_add_f8(rdiff, rdiff);                     // r = 2 * (S2 - S1)
    let v: array<u32, 8> = montgomery_product_f8(u1, i);                // V = U1 * I
    let r2: array<u32, 8> = montgomery_product_f8(r, r);                // r^2
    var x3: array<u32, 8> = fr_sub_f8(r2, j);
    let twov: array<u32, 8> = fr_add_f8(v, v);
    x3 = fr_sub_f8(x3, twov);                                           // X3 = r^2 - J - 2V
    let vx3: array<u32, 8> = fr_sub_f8(v, x3);
    let rvx3: array<u32, 8> = montgomery_product_f8(r, vx3);
    let s1j: array<u32, 8> = montgomery_product_f8(s1, j);
    let twos1j: array<u32, 8> = fr_add_f8(s1j, s1j);
    let y3: array<u32, 8> = fr_sub_f8(rvx3, twos1j);                    // Y3 = r*(V-X3) - 2*S1*J
    let zsum: array<u32, 8> = fr_add_f8(z1, z2);
    let zsum2: array<u32, 8> = montgomery_product_f8(zsum, zsum);
    let zsum2_z1z1: array<u32, 8> = fr_sub_f8(zsum2, z1z1);
    let zdelta: array<u32, 8> = fr_sub_f8(zsum2_z1z1, z2z2);            // (Z1+Z2)^2 - Z1^2 - Z2^2
    let z3: array<u32, 8> = montgomery_product_f8(zdelta, h);           // Z3 = (...) * H
    return array<array<u32, 8>, 3>(x3, y3, z3);
}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let t = gid.x;
    let m_out = params.x;
    if (t >= m_out) {
        return;
    }
    let in_stride = params.y;
    let out_stride = params.z;
    let num_doublings = params.w;

    let in_sx = 0u * in_stride;
    let in_sy = 1u * in_stride;
    let in_sz = 2u * in_stride;
    let in_wx = 3u * in_stride;
    let in_wy = 4u * in_stride;
    let in_wz = 5u * in_stride;

    let il = 2u * t;
    let ir = 2u * t + 1u;

    let slx: array<u32, 8> = load_plane(in_sx, il);
    let sly: array<u32, 8> = load_plane(in_sy, il);
    let slz: array<u32, 8> = load_plane(in_sz, il);
    let srx: array<u32, 8> = load_plane(in_sx, ir);
    let sry: array<u32, 8> = load_plane(in_sy, ir);
    let srz: array<u32, 8> = load_plane(in_sz, ir);
    let wlx: array<u32, 8> = load_plane(in_wx, il);
    let wly: array<u32, 8> = load_plane(in_wy, il);
    let wlz: array<u32, 8> = load_plane(in_wz, il);
    let wrx: array<u32, 8> = load_plane(in_wx, ir);
    let wry: array<u32, 8> = load_plane(in_wy, ir);
    let wrz: array<u32, 8> = load_plane(in_wz, ir);

    // S = S_L + S_R
    let s_new = jac_add(slx, sly, slz, srx, sry, srz);

    // hS_R = (2^l) * S_R via l doublings (l = num_doublings)
    var dx: array<u32, 8> = srx;
    var dy: array<u32, 8> = sry;
    var dz: array<u32, 8> = srz;
    for (var k: u32 = 0u; k < num_doublings; k = k + 1u) {
        let dd = jac_double(dx, dy, dz);
        dx = dd[0];
        dy = dd[1];
        dz = dd[2];
    }

    // W = W_L + hS_R + W_R
    let w_tmp = jac_add(wlx, wly, wlz, dx, dy, dz);
    let w_new = jac_add(w_tmp[0], w_tmp[1], w_tmp[2], wrx, wry, wrz);

    let out_sx = 0u * out_stride;
    let out_sy = 1u * out_stride;
    let out_sz = 2u * out_stride;
    let out_wx = 3u * out_stride;
    let out_wy = 4u * out_stride;
    let out_wz = 5u * out_stride;
    store_plane(out_sx, t, s_new[0]);
    store_plane(out_sy, t, s_new[1]);
    store_plane(out_sz, t, s_new[2]);
    store_plane(out_wx, t, w_new[0]);
    store_plane(out_wy, t, w_new[1]);
    store_plane(out_wz, t, w_new[2]);

    {{{ recompile }}}
}
