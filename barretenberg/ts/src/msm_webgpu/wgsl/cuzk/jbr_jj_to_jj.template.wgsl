{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

{{> field8_funcs }}

// Bucket-reduction round r >= 1: Jacobian + Jacobian -> Jacobian (S, W),
// with empty-subtree presence and single-bucket position tracking.
//
// Each (S, W) tree node summarises a contiguous range of buckets:
//   S = Σ B[k] over the range,
//   W = Σ (pos · B[k]) with pos = 1..h relative to the range start.
// Merge two adjacent children (S_L, W_L), (S_R, W_R) of size h each into
// one (S, W) of size 2h. `meta` packs (is_present | (unitp << 1)) per
// node; unitp != 0 marks "exactly one bucket at relative position unitp".
//
//   case (L, R)
//     (1, 1) — full merge:
//              S = S_L + S_R; hS_R = double S_R l times (l = log2(h));
//              W = W_L + hS_R + W_R. Result is multi-bucket.
//     (1, 0) — pass-through L (S, W, unitp) = (S_L, W_L, L.unitp)
//     (0, 1) — S = S_R; new unitp = R.unitp == 0 ? 0 : h + R.unitp.
//              W is the trap: when R is a single-bucket subtree with
//              R.unitp == h, hS_R and R.W are both the Jacobian form of
//              the SAME 2^r · B[k], so the standard jacAdd hits the
//              doubling case. Use jacDouble(R.W) in that one sub-case;
//              the standard formula is safe otherwise.
//     (0, 0) — inf; meta = 0
//
// All Jacobian add and double formulas are MANUALLY INLINED into main —
// WGSL doesn't guarantee function-call inlining and array<u32, 8>
// by-value parameter passing inflates the live-set if the compiler
// marshals through stack memory. The hot case-(1,1) path is broken into
// four scoped stages (S, doublings, W_tmp, W_new); inputs are loaded
// lazily at the start of each stage and intermediates fall out of the
// live set at the closing brace. Stage outputs that survive to the next
// stage (dx,dy,dz and wtx,wty,wtz) are declared as outer-scope vars and
// rewritten in place; this lets the compiler keep them in registers
// without ballooning peak live count.

const PG: u32 = 2u;

@group(0) @binding(0) var<storage, read>       in_buf:    array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> out_buf:   array<vec4<u32>>;
@group(0) @binding(2) var<storage, read>       meta_in:   array<u32>;
@group(0) @binding(3) var<storage, read_write> meta_out:  array<u32>;
@group(0) @binding(4) var<uniform>             params:    vec4<u32>;
// params.x = M_out_pairs (output node count this round)
// params.y = in_plane_stride (field-elements per plane in in_buf)
// params.z = out_plane_stride (field-elements per plane in out_buf)
// params.w = num_doublings (= log2(h), where h = size of each input child;
//            h = 1 << num_doublings)

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
    let h_size: u32 = 1u << num_doublings;

    let in_sx = 0u * in_stride;
    let in_sy = 1u * in_stride;
    let in_sz = 2u * in_stride;
    let in_wx = 3u * in_stride;
    let in_wy = 4u * in_stride;
    let in_wz = 5u * in_stride;

    let out_sx = 0u * out_stride;
    let out_sy = 1u * out_stride;
    let out_sz = 2u * out_stride;
    let out_wx = 3u * out_stride;
    let out_wy = 4u * out_stride;
    let out_wz = 5u * out_stride;

    let il = 2u * t;
    let ir = 2u * t + 1u;
    let l_meta = meta_in[il];
    let r_meta = meta_in[ir];
    let l_pres: bool = (l_meta & 1u) != 0u;
    let r_pres: bool = (r_meta & 1u) != 0u;

    // -------------- (0, 0) — both absent --------------
    if (!l_pres && !r_pres) {
        let zero: array<u32, 8> = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
        store_plane(out_sx, t, zero);
        store_plane(out_sy, t, zero);
        store_plane(out_sz, t, zero);
        store_plane(out_wx, t, zero);
        store_plane(out_wy, t, zero);
        store_plane(out_wz, t, zero);
        meta_out[t] = 0u;
        {{{ recompile }}}
        return;
    }

    // -------------- (1, 0) — pass-through L --------------
    if (l_pres && !r_pres) {
        let l_unitp: u32 = l_meta >> 1u;
        store_plane(out_sx, t, load_plane(in_sx, il));
        store_plane(out_sy, t, load_plane(in_sy, il));
        store_plane(out_sz, t, load_plane(in_sz, il));
        store_plane(out_wx, t, load_plane(in_wx, il));
        store_plane(out_wy, t, load_plane(in_wy, il));
        store_plane(out_wz, t, load_plane(in_wz, il));
        meta_out[t] = 1u | (l_unitp << 1u);
        {{{ recompile }}}
        return;
    }

    // -------------- (0, 1) — only R present --------------
    if (!l_pres && r_pres) {
        let r_unitp: u32 = r_meta >> 1u;
        let srx = load_plane(in_sx, ir);
        let sry = load_plane(in_sy, ir);
        let srz = load_plane(in_sz, ir);
        store_plane(out_sx, t, srx);
        store_plane(out_sy, t, sry);
        store_plane(out_sz, t, srz);
        let wrx = load_plane(in_wx, ir);
        let wry = load_plane(in_wy, ir);
        let wrz = load_plane(in_wz, ir);

        let r_is_unit_at_h: bool = (r_unitp != 0u) && (r_unitp == h_size);
        if (r_is_unit_at_h) {
            // jac_double(wrx, wry, wrz) inlined.
            let a01 = montgomery_product_f8(wrx, wrx);
            let b01 = montgomery_product_f8(wry, wry);
            let c01 = montgomery_product_f8(b01, b01);
            let xb01 = fr_add_f8(wrx, b01);
            let s01 = fr_sub_f8(fr_sub_f8(montgomery_product_f8(xb01, xb01), a01), c01);
            let d01 = fr_add_f8(s01, s01);
            let twoa01 = fr_add_f8(a01, a01);
            let e01 = fr_add_f8(twoa01, a01);
            let f01 = montgomery_product_f8(e01, e01);
            let wxo = fr_sub_f8(f01, fr_add_f8(d01, d01));
            let dx3_01 = fr_sub_f8(d01, wxo);
            let edx3_01 = montgomery_product_f8(e01, dx3_01);
            let twoc_01 = fr_add_f8(c01, c01);
            let fourc_01 = fr_add_f8(twoc_01, twoc_01);
            let eightc_01 = fr_add_f8(fourc_01, fourc_01);
            let wyo = fr_sub_f8(edx3_01, eightc_01);
            let yz01 = fr_add_f8(wry, wrz);
            let yz2_01 = montgomery_product_f8(yz01, yz01);
            let zz01 = montgomery_product_f8(wrz, wrz);
            let wzo = fr_sub_f8(fr_sub_f8(yz2_01, b01), zz01);
            store_plane(out_wx, t, wxo);
            store_plane(out_wy, t, wyo);
            store_plane(out_wz, t, wzo);
        } else {
            // Standard: W = h * S_R + W_R via the chain.
            var dxd = srx;
            var dyd = sry;
            var dzd = srz;
            for (var k: u32 = 0u; k < num_doublings; k = k + 1u) {
                let a_d = montgomery_product_f8(dxd, dxd);
                let b_d = montgomery_product_f8(dyd, dyd);
                let c_d = montgomery_product_f8(b_d, b_d);
                let xb_d = fr_add_f8(dxd, b_d);
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
                let yz_d = fr_add_f8(dyd, dzd);
                let yz2_d = montgomery_product_f8(yz_d, yz_d);
                let zz_d = montgomery_product_f8(dzd, dzd);
                let z3_d = fr_sub_f8(fr_sub_f8(yz2_d, b_d), zz_d);
                dxd = x3_d;
                dyd = y3_d;
                dzd = z3_d;
            }
            // jac_add(dxd,dyd,dzd, wrx,wry,wrz) inlined → (wxo, wyo, wzo).
            let z1z1_w0 = montgomery_product_f8(dzd, dzd);
            let z2z2_w0 = montgomery_product_f8(wrz, wrz);
            let u1_w0 = montgomery_product_f8(dxd, z2z2_w0);
            let u2_w0 = montgomery_product_f8(wrx, z1z1_w0);
            let s1_w0 = montgomery_product_f8(montgomery_product_f8(dyd, wrz), z2z2_w0);
            let s2_w0 = montgomery_product_f8(montgomery_product_f8(wry, dzd), z1z1_w0);
            let h_w0 = fr_sub_f8(u2_w0, u1_w0);
            let twoh_w0 = fr_add_f8(h_w0, h_w0);
            let i_w0 = montgomery_product_f8(twoh_w0, twoh_w0);
            let j_w0 = montgomery_product_f8(h_w0, i_w0);
            let r_w0 = fr_add_f8(fr_sub_f8(s2_w0, s1_w0), fr_sub_f8(s2_w0, s1_w0));
            let v_w0 = montgomery_product_f8(u1_w0, i_w0);
            let r2_w0 = montgomery_product_f8(r_w0, r_w0);
            var wxo = fr_sub_f8(r2_w0, j_w0);
            wxo = fr_sub_f8(wxo, fr_add_f8(v_w0, v_w0));
            let vx3_w0 = fr_sub_f8(v_w0, wxo);
            let rvx3_w0 = montgomery_product_f8(r_w0, vx3_w0);
            let s1j_w0 = montgomery_product_f8(s1_w0, j_w0);
            let wyo = fr_sub_f8(rvx3_w0, fr_add_f8(s1j_w0, s1j_w0));
            let zsum_w0 = fr_add_f8(dzd, wrz);
            let zsum2_w0 = montgomery_product_f8(zsum_w0, zsum_w0);
            let zdelta_w0 = fr_sub_f8(fr_sub_f8(zsum2_w0, z1z1_w0), z2z2_w0);
            let wzo = montgomery_product_f8(zdelta_w0, h_w0);
            store_plane(out_wx, t, wxo);
            store_plane(out_wy, t, wyo);
            store_plane(out_wz, t, wzo);
        }
        let unitp_out: u32 = select(0u, h_size + r_unitp, r_unitp != 0u);
        meta_out[t] = 1u | (unitp_out << 1u);
        {{{ recompile }}}
        return;
    }

    // -------------- (1, 1) — full merge, hot path -----------
    // Stages: (A) compute and store S_new, (B) doublings of S_R, (C)
    // W_tmp = W_L + hS_R, (D) W_new = W_tmp + W_R. dx*/dy*/dz* carry hS_R
    // from B to C; wtx/wty/wtz carry W_tmp from C to D.

    var dx: array<u32, 8>;
    var dy: array<u32, 8>;
    var dz: array<u32, 8>;
    var wtx: array<u32, 8>;
    var wty: array<u32, 8>;
    var wtz: array<u32, 8>;

    // ---- Stage A: S_new = S_L + S_R ----
    {
        let slx = load_plane(in_sx, il);
        let sly = load_plane(in_sy, il);
        let slz = load_plane(in_sz, il);
        let srx = load_plane(in_sx, ir);
        let sry = load_plane(in_sy, ir);
        let srz = load_plane(in_sz, ir);

        // jac_add(sl*, sr*) inlined → store directly to out_buf.
        let z1z1_a = montgomery_product_f8(slz, slz);
        let z2z2_a = montgomery_product_f8(srz, srz);
        let u1_a = montgomery_product_f8(slx, z2z2_a);
        let u2_a = montgomery_product_f8(srx, z1z1_a);
        let s1_a = montgomery_product_f8(montgomery_product_f8(sly, srz), z2z2_a);
        let s2_a = montgomery_product_f8(montgomery_product_f8(sry, slz), z1z1_a);
        let h_a = fr_sub_f8(u2_a, u1_a);
        let twoh_a = fr_add_f8(h_a, h_a);
        let i_a = montgomery_product_f8(twoh_a, twoh_a);
        let j_a = montgomery_product_f8(h_a, i_a);
        let r_a = fr_add_f8(fr_sub_f8(s2_a, s1_a), fr_sub_f8(s2_a, s1_a));
        let v_a = montgomery_product_f8(u1_a, i_a);
        let r2_a = montgomery_product_f8(r_a, r_a);
        var x3_a = fr_sub_f8(r2_a, j_a);
        x3_a = fr_sub_f8(x3_a, fr_add_f8(v_a, v_a));
        let vx3_a = fr_sub_f8(v_a, x3_a);
        let rvx3_a = montgomery_product_f8(r_a, vx3_a);
        let s1j_a = montgomery_product_f8(s1_a, j_a);
        let y3_a = fr_sub_f8(rvx3_a, fr_add_f8(s1j_a, s1j_a));
        let zsum_a = fr_add_f8(slz, srz);
        let zsum2_a = montgomery_product_f8(zsum_a, zsum_a);
        let zdelta_a = fr_sub_f8(fr_sub_f8(zsum2_a, z1z1_a), z2z2_a);
        let z3_a = montgomery_product_f8(zdelta_a, h_a);
        store_plane(out_sx, t, x3_a);
        store_plane(out_sy, t, y3_a);
        store_plane(out_sz, t, z3_a);

        // Initialize doubling accumulator from S_R; sl*/sr* die at scope close.
        dx = srx;
        dy = sry;
        dz = srz;
    }

    // ---- Stage B: hS_R = double^r (S_R) ----
    for (var k: u32 = 0u; k < num_doublings; k = k + 1u) {
        let a_b = montgomery_product_f8(dx, dx);
        let b_b = montgomery_product_f8(dy, dy);
        let c_b = montgomery_product_f8(b_b, b_b);
        let xb_b = fr_add_f8(dx, b_b);
        let s_b = fr_sub_f8(fr_sub_f8(montgomery_product_f8(xb_b, xb_b), a_b), c_b);
        let d_b = fr_add_f8(s_b, s_b);
        let twoa_b = fr_add_f8(a_b, a_b);
        let e_b = fr_add_f8(twoa_b, a_b);
        let f_b = montgomery_product_f8(e_b, e_b);
        let x3_b = fr_sub_f8(f_b, fr_add_f8(d_b, d_b));
        let dx3_b = fr_sub_f8(d_b, x3_b);
        let edx3_b = montgomery_product_f8(e_b, dx3_b);
        let twoc_b = fr_add_f8(c_b, c_b);
        let fourc_b = fr_add_f8(twoc_b, twoc_b);
        let eightc_b = fr_add_f8(fourc_b, fourc_b);
        let y3_b = fr_sub_f8(edx3_b, eightc_b);
        let yz_b = fr_add_f8(dy, dz);
        let yz2_b = montgomery_product_f8(yz_b, yz_b);
        let zz_b = montgomery_product_f8(dz, dz);
        let z3_b = fr_sub_f8(fr_sub_f8(yz2_b, b_b), zz_b);
        dx = x3_b;
        dy = y3_b;
        dz = z3_b;
    }

    // ---- Stage C: W_tmp = W_L + hS_R ----
    {
        let wlx = load_plane(in_wx, il);
        let wly = load_plane(in_wy, il);
        let wlz = load_plane(in_wz, il);

        // jac_add(wl*, d*) inlined → wt*.
        let z1z1_c = montgomery_product_f8(wlz, wlz);
        let z2z2_c = montgomery_product_f8(dz, dz);
        let u1_c = montgomery_product_f8(wlx, z2z2_c);
        let u2_c = montgomery_product_f8(dx, z1z1_c);
        let s1_c = montgomery_product_f8(montgomery_product_f8(wly, dz), z2z2_c);
        let s2_c = montgomery_product_f8(montgomery_product_f8(dy, wlz), z1z1_c);
        let h_c = fr_sub_f8(u2_c, u1_c);
        let twoh_c = fr_add_f8(h_c, h_c);
        let i_c = montgomery_product_f8(twoh_c, twoh_c);
        let j_c = montgomery_product_f8(h_c, i_c);
        let r_c = fr_add_f8(fr_sub_f8(s2_c, s1_c), fr_sub_f8(s2_c, s1_c));
        let v_c = montgomery_product_f8(u1_c, i_c);
        let r2_c = montgomery_product_f8(r_c, r_c);
        var x3_c = fr_sub_f8(r2_c, j_c);
        x3_c = fr_sub_f8(x3_c, fr_add_f8(v_c, v_c));
        let vx3_c = fr_sub_f8(v_c, x3_c);
        let rvx3_c = montgomery_product_f8(r_c, vx3_c);
        let s1j_c = montgomery_product_f8(s1_c, j_c);
        let y3_c = fr_sub_f8(rvx3_c, fr_add_f8(s1j_c, s1j_c));
        let zsum_c = fr_add_f8(wlz, dz);
        let zsum2_c = montgomery_product_f8(zsum_c, zsum_c);
        let zdelta_c = fr_sub_f8(fr_sub_f8(zsum2_c, z1z1_c), z2z2_c);
        let z3_c = montgomery_product_f8(zdelta_c, h_c);
        wtx = x3_c;
        wty = y3_c;
        wtz = z3_c;
        // wl* and d* die at scope close.
    }

    // ---- Stage D: W_new = W_tmp + W_R ----
    {
        let wrx = load_plane(in_wx, ir);
        let wry = load_plane(in_wy, ir);
        let wrz = load_plane(in_wz, ir);

        // jac_add(wt*, wr*) inlined → store directly to out_buf.
        let z1z1_d = montgomery_product_f8(wtz, wtz);
        let z2z2_d = montgomery_product_f8(wrz, wrz);
        let u1_d = montgomery_product_f8(wtx, z2z2_d);
        let u2_d = montgomery_product_f8(wrx, z1z1_d);
        let s1_d = montgomery_product_f8(montgomery_product_f8(wty, wrz), z2z2_d);
        let s2_d = montgomery_product_f8(montgomery_product_f8(wry, wtz), z1z1_d);
        let h_d = fr_sub_f8(u2_d, u1_d);
        let twoh_d = fr_add_f8(h_d, h_d);
        let i_d = montgomery_product_f8(twoh_d, twoh_d);
        let j_d = montgomery_product_f8(h_d, i_d);
        let r_d = fr_add_f8(fr_sub_f8(s2_d, s1_d), fr_sub_f8(s2_d, s1_d));
        let v_d = montgomery_product_f8(u1_d, i_d);
        let r2_d = montgomery_product_f8(r_d, r_d);
        var x3_d = fr_sub_f8(r2_d, j_d);
        x3_d = fr_sub_f8(x3_d, fr_add_f8(v_d, v_d));
        let vx3_d = fr_sub_f8(v_d, x3_d);
        let rvx3_d = montgomery_product_f8(r_d, vx3_d);
        let s1j_d = montgomery_product_f8(s1_d, j_d);
        let y3_d = fr_sub_f8(rvx3_d, fr_add_f8(s1j_d, s1j_d));
        let zsum_d = fr_add_f8(wtz, wrz);
        let zsum2_d = montgomery_product_f8(zsum_d, zsum_d);
        let zdelta_d = fr_sub_f8(fr_sub_f8(zsum2_d, z1z1_d), z2z2_d);
        let z3_d = montgomery_product_f8(zdelta_d, h_d);
        store_plane(out_wx, t, x3_d);
        store_plane(out_wy, t, y3_d);
        store_plane(out_wz, t, z3_d);
        // wt* and wr* die at scope close.
    }
    meta_out[t] = 1u;

    {{{ recompile }}}
}
