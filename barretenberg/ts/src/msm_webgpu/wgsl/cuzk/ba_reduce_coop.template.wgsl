{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> inverse_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

{{> field8_funcs }}

// Single-dispatch cooperative bucket reduction for small c (STRIDE <= 128).
//
// One workgroup per window computes the ENTIRE per-window weighted sum
//     W = sum_{i=0..STRIDE-1} (i+1) * B[i]
// in workgroup shared memory: seed Z from is_present, suffix-scan the buckets
// (S[i] = sum_{k>=i} B[k]), sum-reduce (W = sum_i S[i]), convert to affine.
// Replaces the multi-dispatch reduceInit -> zInit -> jacLevel*N -> jacFinalize
// chain whose ~21 launches dominate the reduce at small c. Inversion-free
// Jacobian adds; one field inversion per window at the very end. Montgomery
// throughout. Every reduction level is a workgroup barrier, never a dispatch.
//
// WG == STRIDE (one thread per bucket). Empty buckets carry Z == 0 and the
// infinity-safe jac_add treats them as the point at infinity.

const PG: u32 = 2u;
const WG: u32 = {{ workgroup_size }}u;
const STRIDE: u32 = {{ stride }}u;

@group(0) @binding(0) var<storage, read_write> red_buf:    array<vec4<u32>>;
@group(0) @binding(1) var<storage, read>       is_present: array<u32>;
@group(0) @binding(2) var<uniform>             cparams:    vec4<u32>;
// cparams = (M (red_buf element stride), _, num_windows, _)

fn load_x(idx: u32, M: u32) -> array<u32, 8> {
    let base = PG * idx;
    let q0 = red_buf[base + 0u];
    let q1 = red_buf[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}
fn load_y(idx: u32, M: u32) -> array<u32, 8> {
    let base = PG * M + PG * idx;
    let q0 = red_buf[base + 0u];
    let q1 = red_buf[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}
fn store_x(idx: u32, M: u32, val: array<u32, 8>) {
    let base = PG * idx;
    red_buf[base + 0u] = vec4<u32>(val[0], val[1], val[2], val[3]);
    red_buf[base + 1u] = vec4<u32>(val[4], val[5], val[6], val[7]);
}
fn store_y(idx: u32, M: u32, val: array<u32, 8>) {
    let base = PG * M + PG * idx;
    red_buf[base + 0u] = vec4<u32>(val[0], val[1], val[2], val[3]);
    red_buf[base + 1u] = vec4<u32>(val[4], val[5], val[6], val[7]);
}

fn fr_select_f8(a: array<u32, 8>, b: array<u32, 8>, cond: bool) -> array<u32, 8> {
    return array<u32, 8>(
        select(a[0], b[0], cond), select(a[1], b[1], cond),
        select(a[2], b[2], cond), select(a[3], b[3], cond),
        select(a[4], b[4], cond), select(a[5], b[5], cond),
        select(a[6], b[6], cond), select(a[7], b[7], cond));
}
fn fr_dbl_f8(a: array<u32, 8>) -> array<u32, 8> { return fr_add_f8(a, a); }

struct Jac { x: array<u32, 8>, y: array<u32, 8>, z: array<u32, 8>, }

fn jac_add_raw(p1: Jac, p2: Jac) -> Jac {
    let Z1Z1 = montgomery_product_f8(p1.z, p1.z);
    let Z2Z2 = montgomery_product_f8(p2.z, p2.z);
    let U1 = montgomery_product_f8(p1.x, Z2Z2);
    let U2 = montgomery_product_f8(p2.x, Z1Z1);
    let S1 = montgomery_product_f8(montgomery_product_f8(p1.y, p2.z), Z2Z2);
    let S2 = montgomery_product_f8(montgomery_product_f8(p2.y, p1.z), Z1Z1);
    let H = fr_sub_f8(U2, U1);
    let twoH = fr_dbl_f8(H);
    let I = montgomery_product_f8(twoH, twoH);
    let J = montgomery_product_f8(H, I);
    let r = fr_dbl_f8(fr_sub_f8(S2, S1));
    let V = montgomery_product_f8(U1, I);
    let X3 = fr_sub_f8(fr_sub_f8(montgomery_product_f8(r, r), J), fr_dbl_f8(V));
    let S1J = montgomery_product_f8(S1, J);
    let Y3 = fr_sub_f8(montgomery_product_f8(r, fr_sub_f8(V, X3)), fr_dbl_f8(S1J));
    let ZpZ = fr_add_f8(p1.z, p2.z);
    let Z3 = montgomery_product_f8(fr_sub_f8(fr_sub_f8(montgomery_product_f8(ZpZ, ZpZ), Z1Z1), Z2Z2), H);
    return Jac(X3, Y3, Z3);
}

// dst += src, point-at-infinity (Z == 0) safe and branchless.
fn jac_add(dst: Jac, src: Jac) -> Jac {
    let sum = jac_add_raw(dst, src);
    let src_inf = is_zero_f8(src.z);
    let dst_inf = is_zero_f8(dst.z);
    var rx = fr_select_f8(sum.x, src.x, dst_inf);
    var ry = fr_select_f8(sum.y, src.y, dst_inf);
    var rz = fr_select_f8(sum.z, src.z, dst_inf);
    rx = fr_select_f8(rx, dst.x, src_inf);
    ry = fr_select_f8(ry, dst.y, src_inf);
    rz = fr_select_f8(rz, dst.z, src_inf);
    return Jac(rx, ry, rz);
}

// Per-window running points (suffix-scan + sum-reduce in place).
var<workgroup> sh_x: array<array<u32, 8>, STRIDE>;
var<workgroup> sh_y: array<array<u32, 8>, STRIDE>;
var<workgroup> sh_z: array<array<u32, 8>, STRIDE>;

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(workgroup_id) wgid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
    let w = wgid.x;
    let tid = lid.x;
    let M = cparams.x;
    let num_windows = cparams.z;
    if (w >= num_windows) { return; }
    let base = w * STRIDE;

    // Load bucket tid into shared, seeding Z from is_present (R if present,
    // 0 = point at infinity if empty).
    let slot = base + tid;
    var z0 = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
    if (is_present[slot] != 0u) { z0 = get_r_f8(); }
    sh_x[tid] = load_x(slot, M);
    sh_y[tid] = load_y(slot, M);
    sh_z[tid] = z0;
    workgroupBarrier();

    // Suffix scan: S[i] = sum_{k>=i} B[k]. Hillis-Steele, double-barriered so
    // the read of S[i+off] never races the write of S[i].
    var off: u32 = 1u;
    loop {
        if (off >= STRIDE) { break; }
        let act = (tid + off < STRIDE);
        var rx = sh_x[tid];
        var ry = sh_y[tid];
        var rz = sh_z[tid];
        if (act) {
            let r = jac_add(Jac(sh_x[tid], sh_y[tid], sh_z[tid]),
                            Jac(sh_x[tid + off], sh_y[tid + off], sh_z[tid + off]));
            rx = r.x; ry = r.y; rz = r.z;
        }
        workgroupBarrier();
        if (act) { sh_x[tid] = rx; sh_y[tid] = ry; sh_z[tid] = rz; }
        workgroupBarrier();
        off = off << 1u;
    }

    // Sum reduce: W = sum_i S[i]. Tree, double-barriered.
    var rs: u32 = STRIDE >> 1u;
    loop {
        if (rs == 0u) { break; }
        let act = (tid < rs);
        var rx = sh_x[tid];
        var ry = sh_y[tid];
        var rz = sh_z[tid];
        if (act) {
            let r = jac_add(Jac(sh_x[tid], sh_y[tid], sh_z[tid]),
                            Jac(sh_x[tid + rs], sh_y[tid + rs], sh_z[tid + rs]));
            rx = r.x; ry = r.y; rz = r.z;
        }
        workgroupBarrier();
        if (act) { sh_x[tid] = rx; sh_y[tid] = ry; sh_z[tid] = rz; }
        workgroupBarrier();
        rs = rs >> 1u;
    }

    // sh[0] = W (Jacobian). Convert to affine in Montgomery form at slot `base`
    // (the gather root). Empty window (Z == 0) writes the (0,0) infinity
    // sentinel the host combine expects.
    if (tid == 0u) {
        let Z = sh_z[0];
        if (is_zero_f8(Z)) {
            let zero = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
            store_x(base, M, zero);
            store_y(base, M, zero);
        } else {
            var z20: BigInt = unpack256_to_limbs(Z);
            var zinv20: BigInt = {{ inv_fn }}(z20);
            var Zinv: array<u32, 8> = pack_limbs_to_256(&zinv20);
            let Z2inv = montgomery_product_f8(Zinv, Zinv);
            let Z3inv = montgomery_product_f8(Z2inv, Zinv);
            store_x(base, M, montgomery_product_f8(sh_x[0], Z2inv));
            store_y(base, M, montgomery_product_f8(sh_y[0], Z3inv));
        }
    }
}
