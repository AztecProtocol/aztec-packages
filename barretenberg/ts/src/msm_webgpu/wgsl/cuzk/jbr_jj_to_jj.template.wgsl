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
//              the standard formula is safe otherwise (R multi-bucket
//              mixes distinct generators; R unit with R.unitp != h yields
//              two distinct scalar multiples of B[k]).
//     (0, 0) — inf; meta = 0
//
// One output thread per merge. No coordinate-collision branch in the field
// arithmetic itself — the only `if` here is the structural case split on
// presence / unitp, which the user's constraint (no `x1 == x2` branch in
// the group law) explicitly permits.

const PG: u32 = 2u;
const WG: u32 = {{ workgroup_size }}u;

@group(0) @binding(0) var<storage, read>       in_buf:    array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> out_buf:   array<vec4<u32>>;
@group(0) @binding(2) var<storage, read>       meta_in:   array<u32>;
@group(0) @binding(3) var<storage, read_write> meta_out:  array<u32>;
@group(0) @binding(4) var<uniform>             params:    vec4<u32>;

// Workgroup-memory scratch for wr* only (3 field-elements per thread =
// 6 vec4<u32>). Loaded from in_buf at function entry, then sourced from
// here during the final W stage. The point is to FORCE wr* out of
// registers across the heavy S-stage jac_add + doublings + W_tmp
// jac_add: WGSL guarantees the scratch read can't be reordered ahead
// of the write, so the compiler must drop the values from registers
// in between. On WG=128 that's 96 B per thread × 128 = 12 KiB per
// workgroup — within both the 16 KiB WebGPU spec minimum and the real
// Adreno limit. (wl* is consumed sooner — right after the doublings —
// so deferred source-level loading is enough; only wr* survives long
// enough to dominate live-set.)
var<workgroup> tg_wr: array<vec4<u32>, 6u * WG>;

fn tg_store_w(lid: u32, plane_in_w: u32, v: array<u32, 8>) {
    let base = 6u * lid + 2u * plane_in_w;
    tg_wr[base + 0u] = vec4<u32>(v[0], v[1], v[2], v[3]);
    tg_wr[base + 1u] = vec4<u32>(v[4], v[5], v[6], v[7]);
}

fn tg_load_w(lid: u32, plane_in_w: u32) -> array<u32, 8> {
    let base = 6u * lid + 2u * plane_in_w;
    let q0 = tg_wr[base + 0u];
    let q1 = tg_wr[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}
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

// Jacobian doubling (a = 0, dbl-2009-l). Z != 0 always (presence-guarded
// callers never invoke this on Jacobian inf).
fn jac_double(
    x: array<u32, 8>, y: array<u32, 8>, z: array<u32, 8>,
) -> array<array<u32, 8>, 3> {
    let a:  array<u32, 8> = montgomery_product_f8(x, x);
    let b:  array<u32, 8> = montgomery_product_f8(y, y);
    let c:  array<u32, 8> = montgomery_product_f8(b, b);
    let xb: array<u32, 8> = fr_add_f8(x, b);
    let xb2: array<u32, 8> = montgomery_product_f8(xb, xb);
    let xb2a: array<u32, 8> = fr_sub_f8(xb2, a);
    let dpre: array<u32, 8> = fr_sub_f8(xb2a, c);
    let d:  array<u32, 8> = fr_add_f8(dpre, dpre);
    let twoa: array<u32, 8> = fr_add_f8(a, a);
    let e:  array<u32, 8> = fr_add_f8(twoa, a);
    let f:  array<u32, 8> = montgomery_product_f8(e, e);
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

// Jacobian + Jacobian add (a = 0, add-2007-bl). Both Z's nonzero, no
// equality check — caller guards against collisions structurally.
fn jac_add(
    x1: array<u32, 8>, y1: array<u32, 8>, z1: array<u32, 8>,
    x2: array<u32, 8>, y2: array<u32, 8>, z2: array<u32, 8>,
) -> array<array<u32, 8>, 3> {
    let z1z1: array<u32, 8> = montgomery_product_f8(z1, z1);
    let z2z2: array<u32, 8> = montgomery_product_f8(z2, z2);
    let u1: array<u32, 8> = montgomery_product_f8(x1, z2z2);
    let u2: array<u32, 8> = montgomery_product_f8(x2, z1z1);
    let y1z2: array<u32, 8> = montgomery_product_f8(y1, z2);
    let s1: array<u32, 8> = montgomery_product_f8(y1z2, z2z2);
    let y2z1: array<u32, 8> = montgomery_product_f8(y2, z1);
    let s2: array<u32, 8> = montgomery_product_f8(y2z1, z1z1);
    let h: array<u32, 8> = fr_sub_f8(u2, u1);
    let twoh: array<u32, 8> = fr_add_f8(h, h);
    let i: array<u32, 8> = montgomery_product_f8(twoh, twoh);
    let j: array<u32, 8> = montgomery_product_f8(h, i);
    let rdiff: array<u32, 8> = fr_sub_f8(s2, s1);
    let r: array<u32, 8> = fr_add_f8(rdiff, rdiff);
    let v: array<u32, 8> = montgomery_product_f8(u1, i);
    let r2: array<u32, 8> = montgomery_product_f8(r, r);
    var x3: array<u32, 8> = fr_sub_f8(r2, j);
    let twov: array<u32, 8> = fr_add_f8(v, v);
    x3 = fr_sub_f8(x3, twov);
    let vx3: array<u32, 8> = fr_sub_f8(v, x3);
    let rvx3: array<u32, 8> = montgomery_product_f8(r, vx3);
    let s1j: array<u32, 8> = montgomery_product_f8(s1, j);
    let twos1j: array<u32, 8> = fr_add_f8(s1j, s1j);
    let y3: array<u32, 8> = fr_sub_f8(rvx3, twos1j);
    let zsum: array<u32, 8> = fr_add_f8(z1, z2);
    let zsum2: array<u32, 8> = montgomery_product_f8(zsum, zsum);
    let zsum2_z1z1: array<u32, 8> = fr_sub_f8(zsum2, z1z1);
    let zdelta: array<u32, 8> = fr_sub_f8(zsum2_z1z1, z2z2);
    let z3: array<u32, 8> = montgomery_product_f8(zdelta, h);
    return array<array<u32, 8>, 3>(x3, y3, z3);
}

fn store_six(
    out_sx: u32, out_sy: u32, out_sz: u32, out_wx: u32, out_wy: u32, out_wz: u32,
    t: u32,
    sx: array<u32, 8>, sy: array<u32, 8>, sz: array<u32, 8>,
    wx: array<u32, 8>, wy: array<u32, 8>, wz: array<u32, 8>,
) {
    store_plane(out_sx, t, sx);
    store_plane(out_sy, t, sy);
    store_plane(out_sz, t, sz);
    store_plane(out_wx, t, wx);
    store_plane(out_wy, t, wy);
    store_plane(out_wz, t, wz);
}

@compute
@workgroup_size({{ workgroup_size }})
fn main(
    @builtin(global_invocation_id) gid: vec3<u32>,
    @builtin(local_invocation_id) lid_in: vec3<u32>,
) {
    let t = gid.x;
    let m_out = params.x;
    if (t >= m_out) {
        return;
    }
    let in_stride = params.y;
    let out_stride = params.z;
    let num_doublings = params.w;
    let h: u32 = 1u << num_doublings;

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
    let l_unitp: u32 = l_meta >> 1u;
    let r_unitp: u32 = r_meta >> 1u;

    let zero: array<u32, 8> = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);

    if (!l_pres && !r_pres) {
        store_six(out_sx, out_sy, out_sz, out_wx, out_wy, out_wz, t,
                  zero, zero, zero, zero, zero, zero);
        meta_out[t] = 0u;
        {{{ recompile }}}
        return;
    }

    if (l_pres && !r_pres) {
        // Pass-through left node — unitp + S + W copy verbatim.
        let slx = load_plane(in_sx, il);
        let sly = load_plane(in_sy, il);
        let slz = load_plane(in_sz, il);
        let wlx = load_plane(in_wx, il);
        let wly = load_plane(in_wy, il);
        let wlz = load_plane(in_wz, il);
        store_six(out_sx, out_sy, out_sz, out_wx, out_wy, out_wz, t,
                  slx, sly, slz, wlx, wly, wlz);
        meta_out[t] = 1u | (l_unitp << 1u);
        {{{ recompile }}}
        return;
    }

    if (!l_pres && r_pres) {
        // S = S_R. W needs care: jacAdd(h * S_R, W_R) hits the doubling case
        // when R is a unit subtree with R.unitp == h (both operands then
        // encode the same group element 2^r · B[k]). Detect via meta and
        // shortcut to jacDouble(W_R). Otherwise the standard formula is
        // safe.
        let srx = load_plane(in_sx, ir);
        let sry = load_plane(in_sy, ir);
        let srz = load_plane(in_sz, ir);
        let wrx = load_plane(in_wx, ir);
        let wry = load_plane(in_wy, ir);
        let wrz = load_plane(in_wz, ir);
        let r_is_unit_at_h: bool = (r_unitp != 0u) && (r_unitp == h);
        var wxo: array<u32, 8>;
        var wyo: array<u32, 8>;
        var wzo: array<u32, 8>;
        if (r_is_unit_at_h) {
            let dd = jac_double(wrx, wry, wrz);
            wxo = dd[0]; wyo = dd[1]; wzo = dd[2];
        } else {
            var dx = srx;
            var dy = sry;
            var dz = srz;
            for (var k: u32 = 0u; k < num_doublings; k = k + 1u) {
                let dd = jac_double(dx, dy, dz);
                dx = dd[0]; dy = dd[1]; dz = dd[2];
            }
            let w_new = jac_add(dx, dy, dz, wrx, wry, wrz);
            wxo = w_new[0]; wyo = w_new[1]; wzo = w_new[2];
        }
        store_six(out_sx, out_sy, out_sz, out_wx, out_wy, out_wz, t,
                  srx, sry, srz, wxo, wyo, wzo);
        // unitp_out = R.unitp == 0 ? 0 : h + R.unitp.
        let unitp_out: u32 = select(0u, h + r_unitp, r_unitp != 0u);
        meta_out[t] = 1u | (unitp_out << 1u);
        {{{ recompile }}}
        return;
    }

    // Both present — full merge. wr* lives the longest (until the final
    // W_new jac_add) so we offload it to workgroup memory at entry; the
    // compiler must drop it from registers between the write here and the
    // read in stage D (the WGSL memory model forbids reordering across
    // the workgroup write). wl* is consumed at stage C, soon enough that
    // source-level deferred loading suffices.
    let lid: u32 = lid_in.x;
    {
        let wrx_e = load_plane(in_wx, ir);
        let wry_e = load_plane(in_wy, ir);
        let wrz_e = load_plane(in_wz, ir);
        tg_store_w(lid, 0u, wrx_e);
        tg_store_w(lid, 1u, wry_e);
        tg_store_w(lid, 2u, wrz_e);
    }

    var dx: array<u32, 8>;
    var dy: array<u32, 8>;
    var dz: array<u32, 8>;
    var s_x: array<u32, 8>;
    var s_y: array<u32, 8>;
    var s_z: array<u32, 8>;
    {
        let slx = load_plane(in_sx, il);
        let sly = load_plane(in_sy, il);
        let slz = load_plane(in_sz, il);
        let srx = load_plane(in_sx, ir);
        let sry = load_plane(in_sy, ir);
        let srz = load_plane(in_sz, ir);

        let s_new = jac_add(slx, sly, slz, srx, sry, srz);
        s_x = s_new[0]; s_y = s_new[1]; s_z = s_new[2];

        dx = srx;
        dy = sry;
        dz = srz;
    }
    // sl* dead; only s_*, d* alive.

    for (var k: u32 = 0u; k < num_doublings; k = k + 1u) {
        let dd = jac_double(dx, dy, dz);
        dx = dd[0]; dy = dd[1]; dz = dd[2];
    }
    // d* now hold hS_R.

    var w_tx: array<u32, 8>;
    var w_ty: array<u32, 8>;
    var w_tz: array<u32, 8>;
    {
        let wlx = load_plane(in_wx, il);
        let wly = load_plane(in_wy, il);
        let wlz = load_plane(in_wz, il);
        let w_tmp = jac_add(wlx, wly, wlz, dx, dy, dz);
        w_tx = w_tmp[0]; w_ty = w_tmp[1]; w_tz = w_tmp[2];
    }
    // wl* and d* dead; only s_*, w_t* alive.

    var w_x: array<u32, 8>;
    var w_y: array<u32, 8>;
    var w_z: array<u32, 8>;
    {
        let wrx = tg_load_w(lid, 0u);
        let wry = tg_load_w(lid, 1u);
        let wrz = tg_load_w(lid, 2u);
        let w_new = jac_add(w_tx, w_ty, w_tz, wrx, wry, wrz);
        w_x = w_new[0]; w_y = w_new[1]; w_z = w_new[2];
    }
    // wr*, w_t* dead.

    store_six(out_sx, out_sy, out_sz, out_wx, out_wy, out_wz, t,
              s_x, s_y, s_z, w_x, w_y, w_z);
    meta_out[t] = 1u; // is_present=1, unitp=0

    {{{ recompile }}}
}
