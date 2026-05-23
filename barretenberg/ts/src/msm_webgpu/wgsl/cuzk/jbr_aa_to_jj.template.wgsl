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
// Each (S, W) tree node summarises a contiguous range of buckets:
//   S = Σ B[k] over the range,
//   W = Σ (pos · B[k]) with pos = 1..h relative to the range start.
// Round 0 covers the two-bucket leaf (P = B[2p+1], Q = B[2p+2]).
//
// Inputs are SRS-derived randomly-independent generators; non-empty buckets
// never coordinate-collide between distinct k's. Empty buckets store (0, 0)
// in bucket_result, which is NOT a valid curve point — so we detect them
// via the all-zero check and short-circuit into the lift / doubling path
// that gives the same (S, W) algebra without feeding (0, 0) into the
// jacobian formulas:
//   case (P, Q) present:
//     (1, 1) — full mmadd(P, Q) and madd(S, Q);   unitp = 0
//     (1, 0) — S = lift(P) = (P.x, P.y, R);       W = lift(P); unitp = 1
//     (0, 1) — S = lift(Q);                        W = jac_double(lift(Q)) = 2Q; unitp = 2
//     (0, 0) — (inf, inf);  is_present_out = 0;   unitp = 0
//
// `meta` is one u32 per output node, packed as `is_present | (unitp << 1)`.
// unitp != 0 flags the subtree as "exactly one bucket at relative position
// unitp" — round-r merges need this to dodge the case (0, 1) doubling
// trap when h == p_R (see jbr_jj_to_jj).

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

// Jacobian doubling, a = 0 (EFD dbl-2009-l). Used for the "case 01" path
// W = 2Q when only the right bucket is present.
fn jac_double_local(
    x: array<u32, 8>, y: array<u32, 8>, z: array<u32, 8>,
) -> array<array<u32, 8>, 3> {
    let a: array<u32, 8> = montgomery_product_f8(x, x);
    let b: array<u32, 8> = montgomery_product_f8(y, y);
    let c: array<u32, 8> = montgomery_product_f8(b, b);
    let xb: array<u32, 8> = fr_add_f8(x, b);
    let xb2: array<u32, 8> = montgomery_product_f8(xb, xb);
    let xb2a: array<u32, 8> = fr_sub_f8(xb2, a);
    let dpre: array<u32, 8> = fr_sub_f8(xb2a, c);
    let d: array<u32, 8> = fr_add_f8(dpre, dpre);
    let twoa: array<u32, 8> = fr_add_f8(a, a);
    let e: array<u32, 8> = fr_add_f8(twoa, a);
    let f: array<u32, 8> = montgomery_product_f8(e, e);
    let twod: array<u32, 8> = fr_add_f8(d, d);
    let x3: array<u32, 8> = fr_sub_f8(f, twod);
    let dx3: array<u32, 8> = fr_sub_f8(d, x3);
    let edx3: array<u32, 8> = montgomery_product_f8(e, dx3);
    let twoc: array<u32, 8> = fr_add_f8(c, c);
    let fourc: array<u32, 8> = fr_add_f8(twoc, twoc);
    let eightc: array<u32, 8> = fr_add_f8(fourc, fourc);
    let y3: array<u32, 8> = fr_sub_f8(edx3, eightc);
    let yz: array<u32, 8> = fr_add_f8(y, z);
    let yz2: array<u32, 8> = montgomery_product_f8(yz, yz);
    let yz2b: array<u32, 8> = fr_sub_f8(yz2, b);
    let zz: array<u32, 8> = montgomery_product_f8(z, z);
    let z3: array<u32, 8> = fr_sub_f8(yz2b, zz);
    return array<array<u32, 8>, 3>(x3, y3, z3);
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
        // Both empty — output Jacobian inf (Z = 0). meta = 0.
        var zero: array<u32, 8> = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
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
        // S = lift(P) = (P.x, P.y, R). W = 1 * P = lift(P). unitp = 1.
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
        // S = lift(Q). W = 2 * Q via Jacobian doubling of lift(Q). unitp = 2.
        let r_one: array<u32, 8> = get_r_f8();
        let dq = jac_double_local(qx, qy, r_one);
        store_plane(plane_sx, t, qx);
        store_plane(plane_sy, t, qy);
        store_plane(plane_sz, t, r_one);
        store_plane(plane_wx, t, dq[0]);
        store_plane(plane_wy, t, dq[1]);
        store_plane(plane_wz, t, dq[2]);
        meta_out[t] = 1u | (2u << 1u);
        {{{ recompile }}}
        return;
    }

    // Both present — full mmadd + madd. Not a unit subtree.
    // ---- S = P + Q via Z1=Z2=1 mixed-mixed add (mmadd-2007-bl, a=0) ----
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

    // ---- W = S + Q via Jacobian + affine mixed add (madd-2007-bl) ----
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

    store_plane(plane_sx, t, sx);
    store_plane(plane_sy, t, sy);
    store_plane(plane_sz, t, sz);
    store_plane(plane_wx, t, wx);
    store_plane(plane_wy, t, wy);
    store_plane(plane_wz, t, wz);
    meta_out[t] = 1u; // is_present=1, unitp=0

    {{{ recompile }}}
}
