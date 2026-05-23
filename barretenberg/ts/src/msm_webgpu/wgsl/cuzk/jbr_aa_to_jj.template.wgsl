{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

{{> field8_funcs }}

// Bucket-reduction round 0: Affine + Affine -> Jacobian (S, W) pair, with
// empty-bucket presence + single-bucket position tracking.
//
//   case (P, Q) present:
//     (1, 1) — full mmadd(P, Q) into S, then madd(S, Q) into W;   unitp = 0
//     (1, 0) — S = lift(P) = (P.x, P.y, R);                       W = lift(P); unitp = 1
//     (0, 1) — S = lift(Q);                                       W = 2·Q via inlined jac_double; unitp = 2
//     (0, 0) — (inf, inf);  is_present_out = 0;                   unitp = 0
//
// `meta` is one u32 per output node, packed as `is_present | (unitp << 1)`.
// unitp != 0 flags the subtree as "exactly one bucket at relative position
// unitp" — round-r merges need this to dodge the case (0, 1) doubling
// trap (see jbr_jj_to_jj).
//
// The case-(1, 1) hot path is broken into two scoped stages — `mmadd_S`
// computing S from (P, Q) and storing immediately, then `madd_W` computing
// W from (S, Q) with S re-loaded from registers via cross-stage var carry.
// Stage-internal intermediates fall out of the live set at the closing
// brace, so the compiler is free to reuse those registers in the next
// stage instead of holding everything live to the bottom of `main`.

const PG: u32 = 2u;

@group(0) @binding(0) var<storage, read>       bucket_result: array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> out_buf:       array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> meta_out:      array<u32>;
@group(0) @binding(3) var<uniform>             params:        vec4<u32>;
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

fn is_aff_zero(x: array<u32, 8>, y: array<u32, 8>) -> bool {
    return is_zero_f8(x) && is_zero_f8(y);
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

    let p_present: bool = !is_aff_zero(px, py);
    let q_present: bool = !is_aff_zero(qx, qy);

    let plane_sx = 0u * m_pairs;
    let plane_sy = 1u * m_pairs;
    let plane_sz = 2u * m_pairs;
    let plane_wx = 3u * m_pairs;
    let plane_wy = 4u * m_pairs;
    let plane_wz = 5u * m_pairs;

    if (!p_present && !q_present) {
        let zero: array<u32, 8> = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
        store_plane(plane_sx, t, zero);
        store_plane(plane_sy, t, zero);
        store_plane(plane_sz, t, zero);
        store_plane(plane_wx, t, zero);
        store_plane(plane_wy, t, zero);
        store_plane(plane_wz, t, zero);
        meta_out[t] = 0u;
        {{{ recompile }}}
        return;
    }

    if (p_present && !q_present) {
        let r_one: array<u32, 8> = get_r_f8();
        store_plane(plane_sx, t, px);
        store_plane(plane_sy, t, py);
        store_plane(plane_sz, t, r_one);
        store_plane(plane_wx, t, px);
        store_plane(plane_wy, t, py);
        store_plane(plane_wz, t, r_one);
        meta_out[t] = 1u | (1u << 1u);
        {{{ recompile }}}
        return;
    }

    if (!p_present && q_present) {
        let r_one: array<u32, 8> = get_r_f8();
        store_plane(plane_sx, t, qx);
        store_plane(plane_sy, t, qy);
        store_plane(plane_sz, t, r_one);
        // jac_double(qx, qy, r_one) inlined → store W = 2Q directly.
        let a_d = montgomery_product_f8(qx, qx);
        let b_d = montgomery_product_f8(qy, qy);
        let c_d = montgomery_product_f8(b_d, b_d);
        let xb_d = fr_add_f8(qx, b_d);
        let s_d = fr_sub_f8(fr_sub_f8(montgomery_product_f8(xb_d, xb_d), a_d), c_d);
        let d_d = fr_add_f8(s_d, s_d);
        let twoa_d = fr_add_f8(a_d, a_d);
        let e_d = fr_add_f8(twoa_d, a_d);
        let f_d = montgomery_product_f8(e_d, e_d);
        let x3_d = fr_sub_f8(f_d, fr_add_f8(d_d, d_d));
        let dx3_d = fr_sub_f8(d_d, x3_d);
        let edx3_d = montgomery_product_f8(e_d, dx3_d);
        let twoc_d = fr_add_f8(c_d, c_d);
        let fourc_d = fr_add_f8(twoc_d, twoc_d);
        let eightc_d = fr_add_f8(fourc_d, fourc_d);
        let y3_d = fr_sub_f8(edx3_d, eightc_d);
        let yz_d = fr_add_f8(qy, r_one);
        let yz2_d = montgomery_product_f8(yz_d, yz_d);
        let zz_d = montgomery_product_f8(r_one, r_one);
        let z3_d = fr_sub_f8(fr_sub_f8(yz2_d, b_d), zz_d);
        store_plane(plane_wx, t, x3_d);
        store_plane(plane_wy, t, y3_d);
        store_plane(plane_wz, t, z3_d);
        meta_out[t] = 1u | (2u << 1u);
        {{{ recompile }}}
        return;
    }

    // -------------- (1, 1) — full mmadd + madd, hot path -----------
    // Stage `mmadd_S`: S = P + Q via Z1=Z2=1 mixed-mixed add (mmadd-2007-bl,
    // a=0). Outputs (sxv, syv, szv) carry across to the W stage; the
    // mmadd-internal intermediates die when the scope closes.
    var sxv: array<u32, 8>;
    var syv: array<u32, 8>;
    var szv: array<u32, 8>;
    {
        let h_s: array<u32, 8> = fr_sub_f8(qx, px);
        let hh_s: array<u32, 8> = montgomery_product_f8(h_s, h_s);
        let i_s: array<u32, 8> = fr_add_f8(fr_add_f8(hh_s, hh_s), fr_add_f8(hh_s, hh_s));
        let j_s: array<u32, 8> = montgomery_product_f8(h_s, i_s);
        let v_s: array<u32, 8> = montgomery_product_f8(px, i_s);
        let r_s: array<u32, 8> = fr_add_f8(fr_sub_f8(qy, py), fr_sub_f8(qy, py));
        let r2_s: array<u32, 8> = montgomery_product_f8(r_s, r_s);
        var sx: array<u32, 8> = fr_sub_f8(r2_s, j_s);
        sx = fr_sub_f8(sx, fr_add_f8(v_s, v_s));
        let rvx_s: array<u32, 8> = montgomery_product_f8(r_s, fr_sub_f8(v_s, sx));
        let sy: array<u32, 8> = fr_sub_f8(rvx_s, fr_add_f8(montgomery_product_f8(py, j_s),
                                                           montgomery_product_f8(py, j_s)));
        let sz: array<u32, 8> = fr_add_f8(h_s, h_s);
        sxv = sx;
        syv = sy;
        szv = sz;
    }
    store_plane(plane_sx, t, sxv);
    store_plane(plane_sy, t, syv);
    store_plane(plane_sz, t, szv);

    // Stage `madd_W`: W = S + Q via Jacobian + affine mixed add (madd-2007-bl,
    // a=0). Uses (sxv, syv, szv) and the still-live affine (qx, qy).
    {
        let z1z1_w: array<u32, 8> = montgomery_product_f8(szv, szv);
        let u2_w: array<u32, 8> = montgomery_product_f8(qx, z1z1_w);
        let s2_w: array<u32, 8> = montgomery_product_f8(montgomery_product_f8(qy, szv), z1z1_w);
        let h_w: array<u32, 8> = fr_sub_f8(u2_w, sxv);
        let hh_w: array<u32, 8> = montgomery_product_f8(h_w, h_w);
        let i_w: array<u32, 8> = fr_add_f8(fr_add_f8(hh_w, hh_w), fr_add_f8(hh_w, hh_w));
        let j_w: array<u32, 8> = montgomery_product_f8(h_w, i_w);
        let r_w: array<u32, 8> = fr_add_f8(fr_sub_f8(s2_w, syv), fr_sub_f8(s2_w, syv));
        let v_w: array<u32, 8> = montgomery_product_f8(sxv, i_w);
        let r2_w: array<u32, 8> = montgomery_product_f8(r_w, r_w);
        var wx: array<u32, 8> = fr_sub_f8(r2_w, j_w);
        wx = fr_sub_f8(wx, fr_add_f8(v_w, v_w));
        let rvx_w: array<u32, 8> = montgomery_product_f8(r_w, fr_sub_f8(v_w, wx));
        let wy: array<u32, 8> = fr_sub_f8(rvx_w, fr_add_f8(montgomery_product_f8(syv, j_w),
                                                           montgomery_product_f8(syv, j_w)));
        let zph_w: array<u32, 8> = fr_add_f8(szv, h_w);
        let zph2_w: array<u32, 8> = montgomery_product_f8(zph_w, zph_w);
        let wz: array<u32, 8> = fr_sub_f8(fr_sub_f8(zph2_w, z1z1_w), hh_w);
        store_plane(plane_wx, t, wx);
        store_plane(plane_wy, t, wy);
        store_plane(plane_wz, t, wz);
    }
    meta_out[t] = 1u;

    {{{ recompile }}}
}
