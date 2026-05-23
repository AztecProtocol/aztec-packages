{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

{{> field8_funcs }}

// Bit-decomposition reduction (BDR) — round 0 (AA -> J).
//
// Replaces the (S, W) tree's per-window reduction with c-1 independent
// pure-sum trees per window. For each window w and each bit j in [0, c-1],
// define G[w, j] = Σ B[k] over k in [1, N] with bit_j(k) = 1; then
// L_w = Σ_j 2^j · G[w, j]. The 2^j weighting moves to a per-window
// Horner kernel (bdr_horner). Each tree's merges are now just jac_add
// (sum, no positional weighting, no doublings inside the merge), so
// per-thread state shrinks (~16 fields vs JBR's ~25) and per-round
// thread count grows (NW × (c-1) × tree-stage-size vs NW × tree-stage-size
// for JBR) — both wins for the c=8 / S25 corner.
//
// Round-0 maps each output thread to one (w, j, pair_in_tree). The two
// leaves of the pair are buckets at 1-indexed positions
//   k = ((leaf >> j) << (j + 1)) | (1 << j) | (leaf & ((1 << j) - 1))
// where leaf in {2 * pair_in_tree, 2 * pair_in_tree + 1}.

const PG: u32 = 2u;

@group(0) @binding(0) var<storage, read>       bucket_result: array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> out_buf:       array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> meta_out:      array<u32>;
@group(0) @binding(3) var<uniform>             params:        vec4<u32>;
// params.x = total_pairs      (= NW * (c - 1) * (N / 4))
// params.y = pairs_per_tree   (= N / 4)
// params.z = trees_per_window (= c - 1)
// params.w = bw               (bucket_result stride per window)

@group(0) @binding(4) var<uniform>             params2:       vec4<u32>;
// params2.x = b_total         (= NW * BW, bucket_result y-plane offset)
// params2.y = (unused)
// params2.z = (unused)
// params2.w = (unused)

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
    let total_pairs = params.x;
    if (t >= total_pairs) {
        return;
    }
    let pairs_per_tree = params.y;
    let trees_per_window = params.z;
    let bw = params.w;
    let b_total = params2.x;

    let pair_in_tree = t % pairs_per_tree;
    let after_pair = t / pairs_per_tree;
    let j = after_pair % trees_per_window;
    let w = after_pair / trees_per_window;

    let left_leaf  = 2u * pair_in_tree;
    let right_leaf = 2u * pair_in_tree + 1u;
    let jmask: u32 = (1u << j) - 1u;
    let jp1: u32 = j + 1u;
    let k_left  = ((left_leaf  >> j) << jp1) | (1u << j) | (left_leaf  & jmask);
    let k_right = ((right_leaf >> j) << jp1) | (1u << j) | (right_leaf & jmask);

    let p_idx = w * bw + k_left;
    let q_idx = w * bw + k_right;

    let px = load_aff_x(p_idx);
    let py = load_aff_y(p_idx, b_total);
    let qx = load_aff_x(q_idx);
    let qy = load_aff_y(q_idx, b_total);

    let p_present = !is_aff_zero(px, py);
    let q_present = !is_aff_zero(qx, qy);

    let plane_x = 0u * total_pairs;
    let plane_y = 1u * total_pairs;
    let plane_z = 2u * total_pairs;

    if (!p_present && !q_present) {
        let zero = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
        store_plane(plane_x, t, zero);
        store_plane(plane_y, t, zero);
        store_plane(plane_z, t, zero);
        meta_out[t] = 0u;
        {{{ recompile }}}
        return;
    }

    if (p_present && !q_present) {
        let r_one = get_r_f8();
        store_plane(plane_x, t, px);
        store_plane(plane_y, t, py);
        store_plane(plane_z, t, r_one);
        meta_out[t] = 1u;
        {{{ recompile }}}
        return;
    }

    if (!p_present && q_present) {
        let r_one = get_r_f8();
        store_plane(plane_x, t, qx);
        store_plane(plane_y, t, qy);
        store_plane(plane_z, t, r_one);
        meta_out[t] = 1u;
        {{{ recompile }}}
        return;
    }

    // Both present — mmadd-2007-bl (Z1 = Z2 = 1). Only S = P + Q;
    // no W in BDR.
    let h_s = fr_sub_f8(qx, px);
    let hh_s = montgomery_product_f8(h_s, h_s);
    let i_s = fr_add_f8(fr_add_f8(hh_s, hh_s), fr_add_f8(hh_s, hh_s));
    let j_s = montgomery_product_f8(h_s, i_s);
    let v_s = montgomery_product_f8(px, i_s);
    let r_s = fr_add_f8(fr_sub_f8(qy, py), fr_sub_f8(qy, py));
    let r2_s = montgomery_product_f8(r_s, r_s);
    var sx = fr_sub_f8(r2_s, j_s);
    sx = fr_sub_f8(sx, fr_add_f8(v_s, v_s));
    let rvx_s = montgomery_product_f8(r_s, fr_sub_f8(v_s, sx));
    let sy = fr_sub_f8(rvx_s, fr_add_f8(montgomery_product_f8(py, j_s),
                                        montgomery_product_f8(py, j_s)));
    let sz = fr_add_f8(h_s, h_s);

    store_plane(plane_x, t, sx);
    store_plane(plane_y, t, sy);
    store_plane(plane_z, t, sz);
    meta_out[t] = 1u;

    {{{ recompile }}}
}
