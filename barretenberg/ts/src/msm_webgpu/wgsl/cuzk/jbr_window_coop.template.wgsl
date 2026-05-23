{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

{{> field8_funcs }}

// Workgroup-cooperative bucket reduction. Each workgroup owns ONE window's
// whole (S, W) tree — AA→J round 0 followed by log2(N/2) JJ→J levels —
// and stages every intermediate node through threadgroup memory instead of
// global storage between rounds. The original dispatch fired 1 + (c−2) ≈
// 7 kernels per redLevel for c=8; each cost ~50µs of driver overhead.
// Fusing into one kernel cashes ~300µs of that overhead in.
//
// Layout fits c ≤ 8 inside the 16 KiB WebGPU workgroup-storage minimum:
//   N_HALF = 2^(c-2) round-0 nodes per window
//   per-node TG = 6 vec4 + 1 u32 (Jacobian + meta) = 196 B
//   c=8 → N_HALF = 64, TG = 12544 B per WG.
// For c > 8 the host stays on the multi-dispatch path. (For c=9 the
// 25.6 KiB needed clears most real Adreno/Apple limits but breaches the
// spec minimum, so we keep this kernel c-gated rather than dynamic.)
//
// Threading: WG = N_HALF threads. Thread tid:
//   sub-round 0  — read B[2*tid+1], B[2*tid+2]; do AA→J merge into TG[tid].
//   sub-round r  (r = 1 .. c−2) — if tid < N_HALF / 2^r, read TG[2*tid],
//                                  TG[2*tid+1]; do JJ→J merge into TG[tid].
// workgroupBarrier between every sub-round so all writes drain before
// the next level reads.
//
// Output: tid=0 writes TG[0]'s W (= L_w) and meta into out_jac + out_meta.

const PG: u32 = 2u;
const WG: u32 = {{ workgroup_size }}u;
const N_HALF: u32 = WG;

@group(0) @binding(0) var<storage, read>       bucket_result: array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> out_jac:       array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> out_meta:      array<u32>;
@group(0) @binding(3) var<uniform>             params:        vec4<u32>;
// params.x = NW          (number of windows)
// params.y = BW          (bucket_result element stride per window)
// params.z = B_TOTAL     (= NW * BW, bucket_result y-plane offset)
// params.w = out_stride  (field-element stride between out_jac planes; the
//            host packs the 6 per-window planes contiguously)

var<workgroup> tg_jac:  array<vec4<u32>, 12u * WG>;  // 6 planes × WG nodes × 2 vec4
var<workgroup> tg_meta: array<u32, WG>;

fn tg_load(plane: u32, node: u32) -> array<u32, 8> {
    let base = 12u * node + 2u * plane;
    let q0 = tg_jac[base + 0u];
    let q1 = tg_jac[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn tg_store(plane: u32, node: u32, v: array<u32, 8>) {
    let base = 12u * node + 2u * plane;
    tg_jac[base + 0u] = vec4<u32>(v[0], v[1], v[2], v[3]);
    tg_jac[base + 1u] = vec4<u32>(v[4], v[5], v[6], v[7]);
}

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

fn out_store(plane_base: u32, w: u32, v: array<u32, 8>) {
    let base = PG * plane_base + PG * w;
    out_jac[base + 0u] = vec4<u32>(v[0], v[1], v[2], v[3]);
    out_jac[base + 1u] = vec4<u32>(v[4], v[5], v[6], v[7]);
}

fn is_zero_arr(v: array<u32, 8>) -> bool {
    return (v[0] | v[1] | v[2] | v[3] | v[4] | v[5] | v[6] | v[7]) == 0u;
}

fn jac_double_local(
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

fn jac_add_local(
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

@compute
@workgroup_size({{ workgroup_size }})
fn main(
    @builtin(local_invocation_id) lid: vec3<u32>,
    @builtin(workgroup_id) wid: vec3<u32>,
) {
    let tid = lid.x;
    let w = wid.x;
    let nw = params.x;
    if (w >= nw) {
        return;
    }
    let bw = params.y;
    let b_total = params.z;
    let out_stride = params.w;

    // ============================================================
    // Sub-round 0 — AA→J for two adjacent buckets in this window.
    // Thread tid handles pair (B[2*tid+1], B[2*tid+2]) for window w.
    // ============================================================
    {
        let p_idx = w * bw + 2u * tid + 1u;
        let q_idx = w * bw + 2u * tid + 2u;
        let px = load_aff_x(p_idx);
        let py = load_aff_y(p_idx, b_total);
        let qx = load_aff_x(q_idx);
        let qy = load_aff_y(q_idx, b_total);
        let p_pres: bool = !(is_zero_arr(px) && is_zero_arr(py));
        let q_pres: bool = !(is_zero_arr(qx) && is_zero_arr(qy));

        let zero: array<u32, 8> = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);

        if (!p_pres && !q_pres) {
            tg_store(0u, tid, zero); tg_store(1u, tid, zero); tg_store(2u, tid, zero);
            tg_store(3u, tid, zero); tg_store(4u, tid, zero); tg_store(5u, tid, zero);
            tg_meta[tid] = 0u;
        } else if (p_pres && !q_pres) {
            let r_one: array<u32, 8> = get_r_f8();
            tg_store(0u, tid, px); tg_store(1u, tid, py); tg_store(2u, tid, r_one);
            tg_store(3u, tid, px); tg_store(4u, tid, py); tg_store(5u, tid, r_one);
            tg_meta[tid] = 1u | (1u << 1u);
        } else if (!p_pres && q_pres) {
            let r_one: array<u32, 8> = get_r_f8();
            let dq = jac_double_local(qx, qy, r_one);
            tg_store(0u, tid, qx); tg_store(1u, tid, qy); tg_store(2u, tid, r_one);
            tg_store(3u, tid, dq[0]); tg_store(4u, tid, dq[1]); tg_store(5u, tid, dq[2]);
            tg_meta[tid] = 1u | (2u << 1u);
        } else {
            // mmadd → S = P + Q
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
            // madd → W = S + Q (S Jacobian, Q affine)
            let z1z1_w = montgomery_product_f8(sz, sz);
            let u2_w = montgomery_product_f8(qx, z1z1_w);
            let s2_w = montgomery_product_f8(montgomery_product_f8(qy, sz), z1z1_w);
            let h_w = fr_sub_f8(u2_w, sx);
            let hh_w = montgomery_product_f8(h_w, h_w);
            let i_w = fr_add_f8(fr_add_f8(hh_w, hh_w), fr_add_f8(hh_w, hh_w));
            let j_w = montgomery_product_f8(h_w, i_w);
            let r_w = fr_add_f8(fr_sub_f8(s2_w, sy), fr_sub_f8(s2_w, sy));
            let v_w = montgomery_product_f8(sx, i_w);
            let r2_w = montgomery_product_f8(r_w, r_w);
            var wx = fr_sub_f8(r2_w, j_w);
            wx = fr_sub_f8(wx, fr_add_f8(v_w, v_w));
            let rvx_w = montgomery_product_f8(r_w, fr_sub_f8(v_w, wx));
            let wy = fr_sub_f8(rvx_w, fr_add_f8(montgomery_product_f8(sy, j_w),
                                                montgomery_product_f8(sy, j_w)));
            let zph_w = fr_add_f8(sz, h_w);
            let wz = fr_sub_f8(fr_sub_f8(montgomery_product_f8(zph_w, zph_w), z1z1_w), hh_w);
            tg_store(0u, tid, sx); tg_store(1u, tid, sy); tg_store(2u, tid, sz);
            tg_store(3u, tid, wx); tg_store(4u, tid, wy); tg_store(5u, tid, wz);
            tg_meta[tid] = 1u;
        }
    }
    workgroupBarrier();

    // ============================================================
    // Sub-rounds 1..log2(N_HALF) — JJ→J. At sub-round r (1-indexed),
    // h = 2^r and live_n thread count halves: N_HALF/2, N_HALF/4, ...
    // ============================================================
    var live_n: u32 = N_HALF >> 1u;
    var num_doublings: u32 = 1u;
    loop {
        if (live_n == 0u) { break; }
        if (tid < live_n) {
            let il = 2u * tid;
            let ir = 2u * tid + 1u;
            let l_meta = tg_meta[il];
            let r_meta = tg_meta[ir];
            let l_pres: bool = (l_meta & 1u) != 0u;
            let r_pres: bool = (r_meta & 1u) != 0u;
            let l_unitp: u32 = l_meta >> 1u;
            let r_unitp: u32 = r_meta >> 1u;
            let h_size: u32 = 1u << num_doublings;

            let zero: array<u32, 8> = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);

            if (!l_pres && !r_pres) {
                tg_store(0u, tid, zero); tg_store(1u, tid, zero); tg_store(2u, tid, zero);
                tg_store(3u, tid, zero); tg_store(4u, tid, zero); tg_store(5u, tid, zero);
                tg_meta[tid] = 0u;
            } else if (l_pres && !r_pres) {
                let lsx = tg_load(0u, il); let lsy = tg_load(1u, il); let lsz = tg_load(2u, il);
                let lwx = tg_load(3u, il); let lwy = tg_load(4u, il); let lwz = tg_load(5u, il);
                tg_store(0u, tid, lsx); tg_store(1u, tid, lsy); tg_store(2u, tid, lsz);
                tg_store(3u, tid, lwx); tg_store(4u, tid, lwy); tg_store(5u, tid, lwz);
                tg_meta[tid] = 1u | (l_unitp << 1u);
            } else if (!l_pres && r_pres) {
                let rsx = tg_load(0u, ir); let rsy = tg_load(1u, ir); let rsz = tg_load(2u, ir);
                let rwx = tg_load(3u, ir); let rwy = tg_load(4u, ir); let rwz = tg_load(5u, ir);
                let r_is_unit_at_h: bool = (r_unitp != 0u) && (r_unitp == h_size);
                var wxo: array<u32, 8>;
                var wyo: array<u32, 8>;
                var wzo: array<u32, 8>;
                if (r_is_unit_at_h) {
                    let dd = jac_double_local(rwx, rwy, rwz);
                    wxo = dd[0]; wyo = dd[1]; wzo = dd[2];
                } else {
                    var dx = rsx; var dy = rsy; var dz = rsz;
                    for (var k: u32 = 0u; k < num_doublings; k = k + 1u) {
                        let dd = jac_double_local(dx, dy, dz);
                        dx = dd[0]; dy = dd[1]; dz = dd[2];
                    }
                    let wn = jac_add_local(dx, dy, dz, rwx, rwy, rwz);
                    wxo = wn[0]; wyo = wn[1]; wzo = wn[2];
                }
                tg_store(0u, tid, rsx); tg_store(1u, tid, rsy); tg_store(2u, tid, rsz);
                tg_store(3u, tid, wxo); tg_store(4u, tid, wyo); tg_store(5u, tid, wzo);
                let unitp_out: u32 = select(0u, h_size + r_unitp, r_unitp != 0u);
                tg_meta[tid] = 1u | (unitp_out << 1u);
            } else {
                let lsx = tg_load(0u, il); let lsy = tg_load(1u, il); let lsz = tg_load(2u, il);
                let rsx = tg_load(0u, ir); let rsy = tg_load(1u, ir); let rsz = tg_load(2u, ir);
                let lwx = tg_load(3u, il); let lwy = tg_load(4u, il); let lwz = tg_load(5u, il);
                let rwx = tg_load(3u, ir); let rwy = tg_load(4u, ir); let rwz = tg_load(5u, ir);
                let sn = jac_add_local(lsx, lsy, lsz, rsx, rsy, rsz);
                var dx = rsx; var dy = rsy; var dz = rsz;
                for (var k: u32 = 0u; k < num_doublings; k = k + 1u) {
                    let dd = jac_double_local(dx, dy, dz);
                    dx = dd[0]; dy = dd[1]; dz = dd[2];
                }
                let wt = jac_add_local(lwx, lwy, lwz, dx, dy, dz);
                let wn = jac_add_local(wt[0], wt[1], wt[2], rwx, rwy, rwz);
                tg_store(0u, tid, sn[0]); tg_store(1u, tid, sn[1]); tg_store(2u, tid, sn[2]);
                tg_store(3u, tid, wn[0]); tg_store(4u, tid, wn[1]); tg_store(5u, tid, wn[2]);
                tg_meta[tid] = 1u;
            }
        }
        workgroupBarrier();
        live_n = live_n >> 1u;
        num_doublings = num_doublings + 1u;
        if (num_doublings >= 32u) { break; } // safety
    }

    // ============================================================
    // Output: tid 0 writes TG[0] (= L_w in W planes) to out_jac[w].
    // ============================================================
    if (tid == 0u) {
        out_store(0u * out_stride, w, tg_load(0u, 0u));
        out_store(1u * out_stride, w, tg_load(1u, 0u));
        out_store(2u * out_stride, w, tg_load(2u, 0u));
        out_store(3u * out_stride, w, tg_load(3u, 0u));
        out_store(4u * out_stride, w, tg_load(4u, 0u));
        out_store(5u * out_stride, w, tg_load(5u, 0u));
        out_meta[w] = tg_meta[0u];
    }

    {{{ recompile }}}
}
