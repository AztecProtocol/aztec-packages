// 22-bit-limb f32 Montgomery product, SOS3-UNROLLED variant.
//
// Drop-in port of the `unrolled` CIOS skeleton (which mirrors the u32
// mitschabaude algorithm) with two mulhilo variants swapped in:
//
//   mulhilo_sos3_corr  : 8-op scalar mulhilo (3 FMA + floor + sub + step
//     + sub + FMA). Same return contract as the baseline mulhilo
//     (hi, lo both in [0, W)). Used for the scalar `xy0` and `qi`
//     extraction calls so the `c_cancel` j=0 trick keeps working.
//
//   mulhilo_sos3_2     : 5-op vec2 mulhilo (3 vec2-FMA + vec2-floor + sub).
//     NO underflow correction — the returned `lo` may be signed in
//     (-W, W) under fast-math due to double-rounding of the inner
//     `a_scaled * b`. Used for the j=1..N-1 inner body, paired with a
//     floor-based `bias_split_f32_le4w` for both the lo-side and
//     carry-side splits (le4w handles signed input correctly).
//
// Op-count delta per outer iter (vs unrolled baseline):
//   - scalar mulhilo calls (xy0, qi extraction): 2 × (8 vs 9) = 2 ops saved
//   - mulhilo2 calls (j=1..11): 11 × (5 vs 9) vec2-ops = 44 vec2 ops saved
//   - bias_split swaps (le3w → le4w): 11 × (3 vs 4) = 11 ops saved
//   - precompute x_i_scaled + qi_scaled: 2 vec2-ops added (1 scalar each)
// Net per outer iter: ~13 scalar + 42 vec2 ops saved.
// Across 12 outer iters: ~700-900 scalar ops saved out of ~10k baseline.
//
// W, W_INV, BIAS come from `mulhilo_22.wgsl`. Mustache substitutions:
//   inner_body_i0       — straight-line inner-j for outer iter i=0.
//   inner_body_general  — straight-line inner-j for outer i=1..N-1.
const NUM_LIMBS: u32 = {{ num_limbs }}u;
const N0: f32        = {{ n0 }};

fn get_p_f32() -> BigIntF32 {
    var p: BigIntF32;
{{{ p_limbs_f32 }}}
    return p;
}

fn bias_split_f32_le2w(x: f32) -> vec2<f32> {
    let hi = step(W, x);
    let lo = fma(-hi, W, x);
    return vec2<f32>(hi, lo);
}

// Floor-based; handles signed input. Used everywhere in the inner body
// because sos3's signed `lo` can make sums dip below 0.
fn bias_split_f32_le4w(x: f32) -> vec2<f32> {
    let hi = floor(x * W_INV);
    let lo = fma(-hi, W, x);
    return vec2<f32>(hi, lo);
}

// Scalar 8-op sos3 mulhilo with underflow correction.
// Returns (hi, lo) with hi ∈ [0, W), lo ∈ [0, W).
fn mulhilo_sos3_corr(a: f32, a_scaled: f32, b: f32) -> vec2<f32> {
    let hi_off_inner = fma(a_scaled, b, W);
    let hi_off       = floor(hi_off_inner);
    let neg_hi_w     = fma(-W, hi_off, BIAS);
    let lo0          = fma(a, b, neg_hi_w);
    let hi_pre       = hi_off - W;
    let underflow    = step(lo0, -0.5);
    let hi           = hi_pre - underflow;
    let lo           = fma(underflow, W, lo0);
    return vec2<f32>(hi, lo);
}

// vec2 5-op sos3 mulhilo, NO correction.
// Returns vec4(hi.x, lo.x, hi.y, lo.y) with hi ∈ [0, W), lo signed in (-W, W).
fn mulhilo_sos3_2(a: vec2<f32>, a_scaled: vec2<f32>, b: vec2<f32>) -> vec4<f32> {
    let hi_off_inner = fma(a_scaled, b, vec2<f32>(W, W));
    let hi_off       = floor(hi_off_inner);
    let neg_hi_w     = fma(vec2<f32>(-W, -W), hi_off, vec2<f32>(BIAS, BIAS));
    let lo           = fma(a, b, neg_hi_w);
    let hi           = hi_off - vec2<f32>(W, W);
    return vec4<f32>(hi.x, lo.x, hi.y, lo.y);
}

// CIOS Montgomery product, sos3 mulhilo. Same outer structure as baseline
// `unrolled` — straight-line inner-j over 12 named locals `s0..s11`.
fn montgomery_product_f32_unreduced(x: ptr<function, BigIntF32>, y: ptr<function, BigIntF32>) -> BigIntF32 {
    var s0: f32  = 0.0;
    var s1: f32  = 0.0;
    var s2: f32  = 0.0;
    var s3: f32  = 0.0;
    var s4: f32  = 0.0;
    var s5: f32  = 0.0;
    var s6: f32  = 0.0;
    var s7: f32  = 0.0;
    var s8: f32  = 0.0;
    var s9: f32  = 0.0;
    var s10: f32 = 0.0;
    var s11: f32 = 0.0;

    var p = get_p_f32();

    // === Outer iter i=0: s[*] treated as zero. ===
    {
        let x_i        = (*x).limbs[0];
        let x_i_scaled = x_i * W_INV;
        let xy0        = mulhilo_sos3_corr(x_i, x_i_scaled, (*y).limbs[0]);
        let qi_mh      = mulhilo_sos3_corr(xy0.y, xy0.y * W_INV, N0);
        let qi         = qi_mh.y;
        let qi_scaled  = qi * W_INV;

        let c_cancel = step(0.5, xy0.y);
        let qp0_lo   = c_cancel * (W - xy0.y);
        let qp0_hi   = fma(qi, p.limbs[0], -qp0_lo) * W_INV;

        let hi_pair    = xy0.x + qp0_hi;
        let carry_full = hi_pair + c_cancel;
        let carry_s    = bias_split_f32_le2w(carry_full);
        var c_hi       = carry_s.x;
        var c_lo       = carry_s.y;

        let xq_scaled = vec2<f32>(x_i_scaled, qi_scaled);
        let xq        = vec2<f32>(x_i, qi);

{{{ inner_body_i0 }}}

        s11 = fma(c_hi, W, c_lo);
    }

    // === Outer iter i=1..NUM_LIMBS-1 ===
    for (var i = 1u; i < NUM_LIMBS; i = i + 1u) {
        let x_i        = (*x).limbs[i];
        let x_i_scaled = x_i * W_INV;

        let xy0       = mulhilo_sos3_corr(x_i, x_i_scaled, (*y).limbs[0]);
        let sum0      = s0 + xy0.y;
        let sum0_s    = bias_split_f32_le2w(sum0);
        let qi_mh     = mulhilo_sos3_corr(sum0_s.y, sum0_s.y * W_INV, N0);
        let qi        = qi_mh.y;
        let qi_scaled = qi * W_INV;

        let c_cancel = step(0.5, sum0_s.y);
        let qp0_lo   = c_cancel * (W - sum0_s.y);
        let qp0_hi   = fma(qi, p.limbs[0], -qp0_lo) * W_INV;

        let c_small   = c_cancel + sum0_s.x;
        let hi_pair   = xy0.x + qp0_hi;
        let carry_full = hi_pair + c_small;
        // carry_full ∈ [0, 2W+2) — non-negative — step-based le3w would also work,
        // but le4w (floor) is one op cheaper.
        let carry_s   = bias_split_f32_le4w(carry_full);
        var c_hi      = carry_s.x;
        var c_lo      = carry_s.y;

        let xq_scaled = vec2<f32>(x_i_scaled, qi_scaled);
        let xq        = vec2<f32>(x_i, qi);

{{{ inner_body_general }}}

        s11 = fma(c_hi, W, c_lo);
    }

    var s: BigIntF32;
    s.limbs[0]  = s0;
    s.limbs[1]  = s1;
    s.limbs[2]  = s2;
    s.limbs[3]  = s3;
    s.limbs[4]  = s4;
    s.limbs[5]  = s5;
    s.limbs[6]  = s6;
    s.limbs[7]  = s7;
    s.limbs[8]  = s8;
    s.limbs[9]  = s9;
    s.limbs[10] = s10;
    s.limbs[11] = s11;
    return s;
}

fn montgomery_product_f32(x: ptr<function, BigIntF32>, y: ptr<function, BigIntF32>) -> BigIntF32 {
    var s = montgomery_product_f32_unreduced(x, y);
    var p = get_p_f32();
    return conditional_reduce_f32(&s, &p);
}

fn conditional_reduce_f32(x: ptr<function, BigIntF32>, y: ptr<function, BigIntF32>) -> BigIntF32 {
    if (bigint_f32_gt(x, y) || bigint_f32_eq(x, y)) {
        var res: BigIntF32;
        let _borrow = bigint_f32_sub(x, y, &res);
        return res;
    }
    return *x;
}
