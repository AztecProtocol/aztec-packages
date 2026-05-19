// f32-22 MSM-integrated bucket-accumulate batch-affine kernel.
//
// Structurally identical to ba_msm_bucket_bench.template.wgsl (same
// S-chunk batched-inverse: forward running prefix-product, ONE inversion
// per chunk, backward peel + lean affine formula; same SoA+vec4 coalesced
// load; points independent so dx = P.x - A.x is always nonzero). The ONE
// difference: the BigInt carried in registers across the whole chunk is
// the 22-bit-limb FLOATING-POINT representation `BigIntF32`
// (array<f32,12>), and every modular multiply is the f32-22
// `montgomery_product_f32` (separate per-slot tlo/thi accumulators, the
// fastest f32 Mont mul in the variant sweep). The hypothesis: 12 f32
// limbs use far fewer registers per resident element than 20 u32 limbs,
// raising occupancy on the register/occupancy-bound batch-affine kernel.
//
// ===== MONTGOMERY DOMAIN INVARIANT (a reviewer audits this) =====
// For every field element z handled in this kernel, the carried
// `BigIntF32` holds, as a plain integer, the value
//     value(BigIntF32) == z * R_f mod p
// where R_f = 2^(12*22) mod p = 2^264 mod p is the f32-22 Montgomery
// radix (compute_misc_params(p, 22).r). Under that representation
// `montgomery_product_f32(X, Y)` computes value = (x*y) * R_f mod p
// (i.e. it divides one R_f out), exactly the Montgomery-product
// convention validated by bench-field-mul.ts's chainedMontReference.
//
// The host packs inputs (packAffineSoA) as 20x13-bit u32 limbs holding
//     value(u32 BigInt) == z * R_u32 mod p,  R_u32 = 2^260 mod p,
// a DIFFERENT Montgomery domain (R_u32 != R_f). So each loaded
// coordinate is domain-corrected exactly once, at load, by one f32-22
// montmul against the compile-time constant K_F whose integer value is
//     value(K_F) == R_f^2 * R_u32^{-1} mod p,
// since montgomery_product_f32(z*R_u32, K_F)
//     = (z*R_u32) * (R_f^2 * R_u32^{-1}) * R_f^{-1} = z * R_f mod p.  ✓
//
// The ONE modular inversion per chunk reuses the EXISTING u32 safegcd
// `fr_inv_by_a` (no hand-rolled inversion). The accumulated forward
// product `acc` is in f32-22 limbs with integer value `prod * R_f`.
// to_u32_bigint repacks that SAME integer into 20x13-bit u32 limbs
// (pure base conversion, value unchanged). fr_inv_by_a(A) returns, for
// integer input A, the value A^{-1} * R_u32 mod p (it inverts the plain
// integer via safegcd then multiplies by r_cubed = R_u32^3, and its
// internal montgomery_product divides one R_u32 out: net A^{-1}*R_u32).
// With A = prod*R_f the result integer is prod^{-1} * R_f^{-1} * R_u32.
// from_u32_bigint repacks that integer back into 12x22-bit f32 limbs
// (value unchanged), then one f32-22 montmul against the compile-time
// constant D_F whose integer value is
//     value(D_F) == R_f^3 * R_u32^{-1} mod p
// restores the f32-22 domain:
//   montgomery_product_f32(prod^{-1}*R_f^{-1}*R_u32, D_F)
//     = (prod^{-1}*R_f^{-1}*R_u32) * (R_f^3*R_u32^{-1}) * R_f^{-1}
//     = prod^{-1} * R_f mod p.  ✓
// Net: ONE f32<->u32 repack pair + ONE extra correction montmul per
// chunk of S pairs => negligible amortised cost.
//
// fr_add_f32 / fr_sub_f32 are thin modular wrappers over the existing
// raw multi-limb bigint_f32_add / bigint_f32_sub plus the SAME
// conditional-reduce structure as the u32 fr_add / fr_sub (subtract p
// when >= p for add; the p-(b-a) / (a-b) split for sub). No new
// reduction algorithm is invented; only the limb representation differs.
//
// LAYOUT (identical to ba_msm_bucket_bench): each u32 BigInt = 20 u32
// limbs = 5 vec4<u32> groups (VG=5). 4 input planes (A.x, A.y, P.x,
// P.y), 2 output planes (R.x, R.y). Thread t streams points
// e = t + i*T for i in 0..S (strided => fully coalesced). params.x = N
// (total point-adds), params.y = T (thread count = N/S).

const S: u32 = {{ s }}u;
const VG: u32 = 5u; // 20 limbs / 4 = 5 vec4 groups

@group(0) @binding(0) var<storage, read>       inp:    array<vec4<u32>>;
@group(0) @binding(1) var<storage, read>       unused: array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> outp:   array<vec4<u32>>;
@group(0) @binding(3) var<uniform>             params: vec4<u32>;

fn load_be(plane_base: u32, e: u32, N: u32) -> BigInt {
    var b: BigInt;
    for (var v = 0u; v < VG; v = v + 1u) {
        let q = inp[plane_base + v * N + e];
        b.limbs[4u * v + 0u] = q.x;
        b.limbs[4u * v + 1u] = q.y;
        b.limbs[4u * v + 2u] = q.z;
        b.limbs[4u * v + 3u] = q.w;
    }
    return b;
}

fn store_be(plane_base: u32, e: u32, N: u32, val: ptr<function, BigInt>) {
    for (var v = 0u; v < VG; v = v + 1u) {
        let q = vec4<u32>(
            (*val).limbs[4u * v + 0u],
            (*val).limbs[4u * v + 1u],
            (*val).limbs[4u * v + 2u],
            (*val).limbs[4u * v + 3u],
        );
        outp[plane_base + v * N + e] = q;
    }
}

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

// === Domain-correction constants (compile-time integer values). ===
// K_F  : R_f^2 * R_u32^{-1} mod p   (load:  z*R_u32 -> z*R_f)
// D_F  : R_f^3 * R_u32^{-1} mod p   (invert: prod^-1*R_f^-1*R_u32 -> prod^-1*R_f)
fn get_k_f() -> BigIntF32 {
    var k: BigIntF32;
{{{ k_f_limbs }}}
    return k;
}

fn get_d_f() -> BigIntF32 {
    var d: BigIntF32;
{{{ d_f_limbs }}}
    return d;
}

// Pure base conversion (value preserved): pack the integer carried by a
// 12x22-bit BigIntF32 into 20x13-bit u32 limbs. Limbs are little-endian.
// The integer is < p < 2^254, so 18 source limbs (18*22 = 396 bits) and
// the assembled 64-bit windows below cover it with room to spare.
fn to_u32_bigint(src: ptr<function, BigIntF32>) -> BigInt {
    var bits_lo: u32 = 0u;   // accumulated source bits, low 32
    var bits_hi: u32 = 0u;   // accumulated source bits, high 32
    var have: u32 = 0u;      // number of valid bits currently buffered
    var sidx: u32 = 0u;      // next source limb to consume
    var r: BigInt;
    for (var o = 0u; o < NUM_WORDS; o = o + 1u) {
        // Ensure at least 13 buffered bits (pull a 22-bit limb if low).
        if (have < 13u && sidx < 12u) {
            let limb: u32 = u32((*src).limbs[sidx]);
            // bits |= limb << have  (64-bit, split lo/hi at bit 32)
            if (have < 32u) {
                bits_lo = bits_lo | (limb << have);
                if (have > 10u) {
                    // 22-bit limb straddles the 32-bit boundary.
                    bits_hi = bits_hi | (limb >> (32u - have));
                }
            } else {
                bits_hi = bits_hi | (limb << (have - 32u));
            }
            have = have + 22u;
            sidx = sidx + 1u;
        }
        r.limbs[o] = bits_lo & 0x1fffu; // low 13 bits
        // bits >>= 13 (64-bit)
        bits_lo = (bits_lo >> 13u) | (bits_hi << 19u);
        bits_hi = bits_hi >> 13u;
        if (have >= 13u) { have = have - 13u; } else { have = 0u; }
    }
    return r;
}

// Pure base conversion (value preserved): pack the integer carried by a
// 20x13-bit BigInt into 12x22-bit f32 limbs (little-endian).
fn from_u32_bigint(src: ptr<function, BigInt>) -> BigIntF32 {
    var bits_lo: u32 = 0u;
    var bits_hi: u32 = 0u;
    var have: u32 = 0u;
    var sidx: u32 = 0u;
    var r: BigIntF32;
    for (var o = 0u; o < 12u; o = o + 1u) {
        // Ensure at least 22 buffered bits (pull 13-bit limbs as needed).
        for (var g = 0u; g < 2u; g = g + 1u) {
            if (have < 22u && sidx < NUM_WORDS) {
                let limb: u32 = (*src).limbs[sidx] & 0x1fffu;
                if (have < 32u) {
                    bits_lo = bits_lo | (limb << have);
                    if (have > 19u) {
                        bits_hi = bits_hi | (limb >> (32u - have));
                    }
                } else {
                    bits_hi = bits_hi | (limb << (have - 32u));
                }
                have = have + 13u;
                sidx = sidx + 1u;
            }
        }
        r.limbs[o] = f32(bits_lo & 0x3fffffu); // low 22 bits
        bits_lo = (bits_lo >> 22u) | (bits_hi << 10u);
        bits_hi = bits_hi >> 22u;
        if (have >= 22u) { have = have - 22u; } else { have = 0u; }
    }
    return r;
}

// Modular field add in the f32-22 representation: raw multi-limb add
// then a single conditional subtract of p when the result >= p. Mirrors
// the u32 fr_add / fr_reduce structure (carry-aware: if the raw add
// overflowed the limb array the value is definitely >= p, so the
// subtract is also taken). bigint_f32_sub returns borrow==1.0 iff a < b.
fn fr_add_f32(a: ptr<function, BigIntF32>, b: ptr<function, BigIntF32>) -> BigIntF32 {
    var sum: BigIntF32;
    let carry = bigint_f32_add(a, b, &sum);
    var p = get_p_f32();
    var red: BigIntF32;
    let borrow = bigint_f32_sub(&sum, &p, &red);
    // Reduce when there was a top carry (sum >= 2^264 > p) OR sum >= p
    // (sum - p did not borrow).
    if (carry > 0.5 || borrow < 0.5) {
        return red;
    }
    return sum;
}

// Modular field sub in the f32-22 representation. Same structure as the
// u32 fr_sub: a == b short-circuits to canonical 0; for a < b the result
// is p - (b - a); for a > b it is the plain limb difference.
fn fr_sub_f32(a: ptr<function, BigIntF32>, b: ptr<function, BigIntF32>) -> BigIntF32 {
    if (bigint_f32_eq(a, b)) {
        var z: BigIntF32;
        for (var i = 0u; i < NUM_LIMBS; i = i + 1u) { z.limbs[i] = 0.0; }
        return z;
    }
    if (bigint_f32_gt(a, b)) { // a > b
        var res: BigIntF32;
        let _bo = bigint_f32_sub(a, b, &res);
        return res;
    }
    // a < b: p - (b - a)
    var diff: BigIntF32;
    let _b1 = bigint_f32_sub(b, a, &diff);
    var p = get_p_f32();
    var res: BigIntF32;
    let _b2 = bigint_f32_sub(&p, &diff, &res);
    return res;
}

// Load a u32-domain coordinate (z*R_u32) and convert it to the f32-22
// Montgomery domain (z*R_f) with ONE correction montmul.
fn load_f32(plane_base: u32, e: u32, N: u32) -> BigIntF32 {
    var u = load_be(plane_base, e, N);
    var f = from_u32_bigint(&u);
    var k = get_k_f();
    return montgomery_product_f32(&f, &k);
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let N = params.x;
    let T = params.y;
    let t = gid.x;
    if (t >= T) { return; }

    let plane = VG * N;
    let ax_base = 0u * plane;
    let ay_base = 1u * plane;
    let px_base = 2u * plane;
    let py_base = 3u * plane;

    // Resident accumulator A.x stays in registers across the chunk
    // (drives the forward dx prefix chain), in the f32-22 domain.
    var acc_x = load_f32(ax_base, t, N);

    // Forward pass: running prefix-product of the S dx values
    // dx_i = P_i.x - A_i.x in the f32-22 Montgomery domain.
    var pref: array<BigIntF32, {{ s }}>;
    var acc: BigIntF32;
    for (var i = 0u; i < S; i = i + 1u) {
        let e = t + i * T;
        var p_x = load_f32(px_base, e, N);
        var dx = fr_sub_f32(&p_x, &acc_x);
        if (i == 0u) {
            acc = dx;
        } else {
            acc = montgomery_product_f32(&acc, &dx);
        }
        pref[i] = acc;
        acc_x = p_x;
    }

    // ONE modular inversion per chunk: f32-22 -> u32 (value preserved),
    // existing safegcd fr_inv_by_a, u32 -> f32-22, one domain-correction
    // montmul. See the MONTGOMERY DOMAIN INVARIANT header.
    var acc_u = to_u32_bigint(&acc);
    var inv_u = fr_inv_by_a(acc_u);
    var inv_raw = from_u32_bigint(&inv_u);
    var d_f = get_d_f();
    var inv = montgomery_product_f32(&inv_raw, &d_f);

    // Backward peel + lean affine formula (dx recomputed free).
    for (var jj = 0u; jj < S; jj = jj + 1u) {
        let i = S - 1u - jj;
        let e = t + i * T;
        var p_x = load_f32(px_base, e, N);
        var p_y = load_f32(py_base, e, N);

        var a_x: BigIntF32;
        var a_y: BigIntF32;
        if (i == 0u) {
            a_x = load_f32(ax_base, t, N);
            a_y = load_f32(ay_base, t, N);
        } else {
            let ep = t + (i - 1u) * T;
            a_x = load_f32(px_base, ep, N);
            a_y = load_f32(py_base, ep, N);
        }

        var inv_dx: BigIntF32;
        if (i == 0u) {
            inv_dx = inv;
        } else {
            var pp = pref[i - 1u];
            inv_dx = montgomery_product_f32(&inv, &pp);
        }

        var lambda = fr_sub_f32(&p_y, &a_y);
        lambda = montgomery_product_f32(&lambda, &inv_dx);
        var r_x = montgomery_product_f32(&lambda, &lambda);
        r_x = fr_sub_f32(&r_x, &a_x);
        r_x = fr_sub_f32(&r_x, &p_x);
        var r_y = fr_sub_f32(&a_x, &r_x);
        r_y = montgomery_product_f32(&lambda, &r_y);
        r_y = fr_sub_f32(&r_y, &a_y);

        // Store the f32-22-domain result repacked into u32 limbs (value
        // preserved). Sanity in the runner only checks non-zero; nothing
        // downstream re-interprets the stored Montgomery domain.
        var rx_u = to_u32_bigint(&r_x);
        var ry_u = to_u32_bigint(&r_y);
        store_be(0u * plane, e, N, &rx_u);
        store_be(1u * plane, e, N, &ry_u);

        if (i != 0u) {
            var dx_back = fr_sub_f32(&p_x, &a_x);
            inv = montgomery_product_f32(&inv, &dx_back);
        }
    }
}
