{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

{{> field8_funcs }}

// Bucket-reduction round 0: Affine + Affine -> Jacobian (S, W) pair.
//
// One thread per output node. Reads two adjacent weighted affine buckets
// from bucket_result, produces a Jacobian (S, W) pair where:
//   S = P + Q                           (Σ of the two buckets)
//   W = 1·P + 2·Q = S + Q               (Σ k·B[k] with positions 1, 2)
// The pair seeds the round-1 input of the tree.
//
// Inputs are SRS-derived randomly-independent generators; no (x1 == x2)
// collision check (the algorithm pre-condition explicitly excludes that
// path) — formulas are pure straight-line.
//
// Layout: bucket_result is the SoA used by ba_finalize_copy: x-plane then
// y-plane, PG = 2 vec4<u32> per field element. Per-window stride = BW.
// Within a window, weighted buckets are at columns 1..N (N = 2^(c-1));
// column 0 (the zero digit) is dropped.
//
// out_buf is the (S, W) Jacobian SoA tree node array. M_pairs nodes per
// round; per-node layout = 6 planes [S.X, S.Y, S.Z, W.X, W.Y, W.Z], each
// plane is PG vec4 wide and stride is M_pairs in field-element units
// (i.e. PG*M_pairs in vec4 units).
//
// Pair index encoding: thread t = w * (N/2) + j. Reads bucket_result at
//   P = (w*BW + 2j + 1) and Q = (w*BW + 2j + 2).

const PG: u32 = 2u;

@group(0) @binding(0) var<storage, read>       bucket_result: array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> out_buf:       array<vec4<u32>>;
@group(0) @binding(2) var<uniform>             params:        vec4<u32>;
// params.x = M_pairs (= NW * N/2, output node count)
// params.y = half_N  (= N/2, output nodes per window — pairs per window)
// params.z = BW      (bucket_result element stride per window)
// params.w = B_total (= NW * BW, bucket_result y-plane offset)

fn load_aff_x(idx: u32, b_total: u32) -> array<u32, 8> {
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

fn store_plane(plane_base: u32, node: u32, val: array<u32, 8>) {
    let base = PG * plane_base + PG * node;
    out_buf[base + 0u] = vec4<u32>(val[0], val[1], val[2], val[3]);
    out_buf[base + 1u] = vec4<u32>(val[4], val[5], val[6], val[7]);
}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let t = gid.x;
    let m_pairs = params.x;
    if (t >= m_pairs) {
        return;
    }
    let half_n = params.y;
    let bw = params.z;
    let b_total = params.w;

    let w = t / half_n;
    let j = t - w * half_n;
    let p_idx = w * bw + 2u * j + 1u;
    let q_idx = w * bw + 2u * j + 2u;

    let px: array<u32, 8> = load_aff_x(p_idx, b_total);
    let py: array<u32, 8> = load_aff_y(p_idx, b_total);
    let qx: array<u32, 8> = load_aff_x(q_idx, b_total);
    let qy: array<u32, 8> = load_aff_y(q_idx, b_total);

    // ---- S = P + Q via Z1=Z2=1 mixed-mixed add (mmadd-2007-bl, a=0) ----
    // H = X2 - X1
    // HH = H^2
    // I = 4*HH
    // J = H*I
    // r = 2*(Y2 - Y1)
    // V = X1*I
    // X3 = r^2 - J - 2*V
    // Y3 = r*(V - X3) - 2*Y1*J
    // Z3 = 2*H
    let h_s: array<u32, 8> = fr_sub_f8(qx, px);
    let hh_s: array<u32, 8> = montgomery_product_f8(h_s, h_s);
    let twohh_s: array<u32, 8> = fr_add_f8(hh_s, hh_s);
    let i_s: array<u32, 8> = fr_add_f8(twohh_s, twohh_s);
    let j_s: array<u32, 8> = montgomery_product_f8(h_s, i_s);
    let v_s: array<u32, 8> = montgomery_product_f8(px, i_s);
    let rdiff_s: array<u32, 8> = fr_sub_f8(qy, py);
    let r_s: array<u32, 8> = fr_add_f8(rdiff_s, rdiff_s);
    let r2_s: array<u32, 8> = montgomery_product_f8(r_s, r_s);
    var sx: array<u32, 8> = fr_sub_f8(r2_s, j_s);
    let twov_s: array<u32, 8> = fr_add_f8(v_s, v_s);
    sx = fr_sub_f8(sx, twov_s);
    let vx_s: array<u32, 8> = fr_sub_f8(v_s, sx);
    let rvx_s: array<u32, 8> = montgomery_product_f8(r_s, vx_s);
    let yj_tmp_s: array<u32, 8> = montgomery_product_f8(py, j_s);
    let twoyj_s: array<u32, 8> = fr_add_f8(yj_tmp_s, yj_tmp_s);
    let sy: array<u32, 8> = fr_sub_f8(rvx_s, twoyj_s);
    let sz: array<u32, 8> = fr_add_f8(h_s, h_s);

    // ---- W = S + Q via mixed (Jacobian + affine, madd-2007-bl) ----
    // Inputs: S = (sx, sy, sz) Jacobian, Q = (qx, qy) affine (Z2 = 1).
    // Z1Z1 = sz^2
    // U2 = qx * Z1Z1
    // S2 = qy * sz * Z1Z1
    // H = U2 - sx
    // HH = H^2
    // I = 4 * HH
    // J = H * I
    // r = 2 * (S2 - sy)
    // V = sx * I
    // X3 = r^2 - J - 2*V
    // Y3 = r * (V - X3) - 2 * sy * J
    // Z3 = (sz + H)^2 - Z1Z1 - HH
    let z1z1_w: array<u32, 8> = montgomery_product_f8(sz, sz);
    let u2_w: array<u32, 8> = montgomery_product_f8(qx, z1z1_w);
    let s2t_w: array<u32, 8> = montgomery_product_f8(qy, sz);
    let s2_w: array<u32, 8> = montgomery_product_f8(s2t_w, z1z1_w);
    let h_w: array<u32, 8> = fr_sub_f8(u2_w, sx);
    let hh_w: array<u32, 8> = montgomery_product_f8(h_w, h_w);
    let twohh_w: array<u32, 8> = fr_add_f8(hh_w, hh_w);
    let i_w: array<u32, 8> = fr_add_f8(twohh_w, twohh_w);
    let j_w: array<u32, 8> = montgomery_product_f8(h_w, i_w);
    let rdiff_w: array<u32, 8> = fr_sub_f8(s2_w, sy);
    let r_w: array<u32, 8> = fr_add_f8(rdiff_w, rdiff_w);
    let v_w: array<u32, 8> = montgomery_product_f8(sx, i_w);
    let r2_w: array<u32, 8> = montgomery_product_f8(r_w, r_w);
    var wx: array<u32, 8> = fr_sub_f8(r2_w, j_w);
    let twov_w: array<u32, 8> = fr_add_f8(v_w, v_w);
    wx = fr_sub_f8(wx, twov_w);
    let vx_w: array<u32, 8> = fr_sub_f8(v_w, wx);
    let rvx_w: array<u32, 8> = montgomery_product_f8(r_w, vx_w);
    let yj_tmp_w: array<u32, 8> = montgomery_product_f8(sy, j_w);
    let twoyj_w: array<u32, 8> = fr_add_f8(yj_tmp_w, yj_tmp_w);
    let wy: array<u32, 8> = fr_sub_f8(rvx_w, twoyj_w);
    let zph_w: array<u32, 8> = fr_add_f8(sz, h_w);
    let zph2_w: array<u32, 8> = montgomery_product_f8(zph_w, zph_w);
    var wz: array<u32, 8> = fr_sub_f8(zph2_w, z1z1_w);
    wz = fr_sub_f8(wz, hh_w);

    // ---- Store (S, W) at output node t ----
    let plane_sx = 0u * m_pairs;
    let plane_sy = 1u * m_pairs;
    let plane_sz = 2u * m_pairs;
    let plane_wx = 3u * m_pairs;
    let plane_wy = 4u * m_pairs;
    let plane_wz = 5u * m_pairs;
    store_plane(plane_sx, t, sx);
    store_plane(plane_sy, t, sy);
    store_plane(plane_sz, t, sz);
    store_plane(plane_wx, t, wx);
    store_plane(plane_wy, t, wy);
    store_plane(plane_wz, t, wz);

    {{{ recompile }}}
}
