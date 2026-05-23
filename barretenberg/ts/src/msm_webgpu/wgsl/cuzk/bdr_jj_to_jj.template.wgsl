{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

{{> field8_funcs }}

// Bit-decomposition reduction — round r >= 1 (JJ -> J). One thread per
// output node merges two adjacent siblings of one (window, bit) tree by
// pure jac_add — no W weighting, no doublings inside the merge. Compared
// to JBR's JJ merge (~50 + 8r mults), each BDR merge is just 16 mults,
// and the per-thread live-set is ~16 fields instead of ~25.
//
// Layout: in_buf / out_buf are 3 planes (X, Y, Z) of Jacobian field
// elements. Each plane has `in_stride` / `out_stride` field-elements,
// packed PG = 2 vec4 each. Trees are laid out per-window-then-per-bit:
// node (w, j, k) sits at slot (w * (c - 1) + j) * nodes_per_tree + k.
// At round r+1, nodes_per_tree_out = nodes_per_tree_in / 2; thread t's
// two input nodes are 2t and 2t+1 in the in-buffer's same tree.

const PG: u32 = 2u;

@group(0) @binding(0) var<storage, read>       in_buf:    array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> out_buf:   array<vec4<u32>>;
@group(0) @binding(2) var<storage, read>       meta_in:   array<u32>;
@group(0) @binding(3) var<storage, read_write> meta_out:  array<u32>;
@group(0) @binding(4) var<uniform>             params:    vec4<u32>;
// params.x = m_out (output node count this round)
// params.y = in_plane_stride (field-elements per plane in in_buf)
// params.z = out_plane_stride (field-elements per plane in out_buf)
// params.w = nodes_per_tree_out (= nodes_per_tree_in / 2)

fn load_plane(plane: u32, node: u32) -> array<u32, 8> {
    let base = PG * plane + PG * node;
    let q0 = in_buf[base + 0u];
    let q1 = in_buf[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn store_plane(plane: u32, node: u32, val: array<u32, 8>) {
    let base = PG * plane + PG * node;
    out_buf[base + 0u] = vec4<u32>(val[0], val[1], val[2], val[3]);
    out_buf[base + 1u] = vec4<u32>(val[4], val[5], val[6], val[7]);
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
    let t = gid.x;
    let m_out = params.x;
    if (t >= m_out) {
        return;
    }
    let in_stride = params.y;
    let out_stride = params.z;
    let nodes_out = params.w;

    // Decode (w, j, k_out) from t; input children are 2k and 2k+1 of the
    // same (w, j) tree.
    let nodes_in = 2u * nodes_out;
    let k_out = t % nodes_out;
    let after_k = t / nodes_out;
    // Address within the input buffer = after_k * nodes_in + 2 * k_out.
    let in_base = after_k * nodes_in;
    let il = in_base + 2u * k_out;
    let ir = in_base + 2u * k_out + 1u;

    let l_pres = (meta_in[il] & 1u) != 0u;
    let r_pres = (meta_in[ir] & 1u) != 0u;

    let plane_x_in = 0u * in_stride;
    let plane_y_in = 1u * in_stride;
    let plane_z_in = 2u * in_stride;
    let plane_x_out = 0u * out_stride;
    let plane_y_out = 1u * out_stride;
    let plane_z_out = 2u * out_stride;

    let zero = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);

    if (!l_pres && !r_pres) {
        store_plane(plane_x_out, t, zero);
        store_plane(plane_y_out, t, zero);
        store_plane(plane_z_out, t, zero);
        meta_out[t] = 0u;
        {{{ recompile }}}
        return;
    }

    if (l_pres && !r_pres) {
        store_plane(plane_x_out, t, load_plane(plane_x_in, il));
        store_plane(plane_y_out, t, load_plane(plane_y_in, il));
        store_plane(plane_z_out, t, load_plane(plane_z_in, il));
        meta_out[t] = 1u;
        {{{ recompile }}}
        return;
    }

    if (!l_pres && r_pres) {
        store_plane(plane_x_out, t, load_plane(plane_x_in, ir));
        store_plane(plane_y_out, t, load_plane(plane_y_in, ir));
        store_plane(plane_z_out, t, load_plane(plane_z_in, ir));
        meta_out[t] = 1u;
        {{{ recompile }}}
        return;
    }

    // Both present — pure jac_add.
    let x1 = load_plane(plane_x_in, il);
    let y1 = load_plane(plane_y_in, il);
    let z1 = load_plane(plane_z_in, il);
    let x2 = load_plane(plane_x_in, ir);
    let y2 = load_plane(plane_y_in, ir);
    let z2 = load_plane(plane_z_in, ir);
    let s = jac_add(x1, y1, z1, x2, y2, z2);
    store_plane(plane_x_out, t, s[0]);
    store_plane(plane_y_out, t, s[1]);
    store_plane(plane_z_out, t, s[2]);
    meta_out[t] = 1u;

    {{{ recompile }}}
}
