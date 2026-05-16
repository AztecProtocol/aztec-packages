// 22-bit-limb f32 Montgomery product, sos3u v2.
//
// Three micro-wins over sos3u:
//
//   1) `mulhilo_sos3_2_v2` returns `hi_off` instead of `hi = hi_off - W`.
//      Saves 1 vec2 sub inside mulhilo. The +W bias on each of {xy_hi, qp_hi}
//      is then absorbed into the carry split via a `bias_split_f32_le4w_m2`
//      that pre-subtracts the +2W from the result hi.
//
//   2) `mulhilo_sos3_qi_lo` is a lo-only variant for the qi extraction.
//      Drops the hi computation and the explicit hi-W subtraction (we never
//      use hi at qi-extract sites). Pre-scales b (N0) instead of a, since
//      N0 is a compile-time constant — saves the runtime `a * W_INV`
//      precompute at the qi extract site.
//
//   3) Balanced add tree for carry_total: `(xy_hi + qp_hi) + (low_s.x + c_hi)`
//      instead of `((xy_hi + qp_hi) + low_s.x) + c_hi`. Same op count, but
//      shortens the critical path by one add (two pairs can run in parallel).
//
// Whether each one actually moves the GPU code is a Metal-compiler question
// — naga leaves the structure intact, but Apple's compiler may already CSE
// the -W subs and reorder adds. The point of this variant is to MEASURE
// whether the compiler is doing those optimizations or leaving them on the
// table.
//
// W, W_INV, BIAS come from `mulhilo_22.wgsl`. Mustache slots:
//   inner_body_i0      — straight-line inner-j for outer iter i=0.
//   inner_body_general — straight-line inner-j for outer i=1..N-1.
const NUM_LIMBS: u32 = {{ num_limbs }}u;
const N0: f32        = {{ n0 }};
const N0_SCALED: f32 = {{ n0_scaled }};   // N0 * W_INV, compile-time constant

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

fn bias_split_f32_le4w(x: f32) -> vec2<f32> {
    let hi = floor(x * W_INV);
    let lo = fma(-hi, W, x);
    return vec2<f32>(hi, lo);
}

// Variant of bias_split_f32_le4w that accounts for an additive +2W bias on
// `x`. Returns (hi - 2, lo) where (hi, lo) is the floor-split of x. lo mod W
// is unchanged by the integer-multiple-of-W bias, so the FMA is the same.
fn bias_split_f32_le4w_m2(x: f32) -> vec2<f32> {
    let hi_biased = floor(x * W_INV);
    let hi        = hi_biased - 2.0;
    let lo        = fma(-hi_biased, W, x);
    return vec2<f32>(hi, lo);
}

// 8-op scalar sos3 mulhilo with underflow correction. Returns (hi, lo) in
// [0, W). Used for xy0 (where xy0.y feeds the c_cancel trick that needs
// a canonical [0, W) input).
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

// 6-op lo-only sos3 mulhilo with underflow correction. Pre-scales `b` (we
// call this with b = N0 constant, b_scaled = N0_SCALED constant). Returns
// only the corrected lo in [0, W). Used at qi extraction sites.
fn mulhilo_sos3_qi_lo(a: f32, b_scaled: f32, b: f32) -> f32 {
    let hi_off_inner = fma(a, b_scaled, W);
    let hi_off       = floor(hi_off_inner);
    let neg_hi_w     = fma(-W, hi_off, BIAS);
    let lo0          = fma(a, b, neg_hi_w);
    let underflow    = step(lo0, -0.5);
    let lo           = fma(underflow, W, lo0);
    return lo;
}

// 4-op vec2 sos3 mulhilo, NO correction, NO -W subtraction. Returns
// vec4(hi_off.x, lo.x, hi_off.y, lo.y) with hi_off ∈ [W, 2W) (= true_hi + W),
// lo signed in (-W, W). Consumer compensates the +W bias on each hi via
// bias_split_f32_le4w_m2.
fn mulhilo_sos3_2_v2(a: vec2<f32>, a_scaled: vec2<f32>, b: vec2<f32>) -> vec4<f32> {
    let hi_off_inner = fma(a_scaled, b, vec2<f32>(W, W));
    let hi_off       = floor(hi_off_inner);
    let neg_hi_w     = fma(vec2<f32>(-W, -W), hi_off, vec2<f32>(BIAS, BIAS));
    let lo           = fma(a, b, neg_hi_w);
    return vec4<f32>(hi_off.x, lo.x, hi_off.y, lo.y);
}

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

    // === Outer iter i=0 ===
    {
        let x_i        = (*x).limbs[0];
        let x_i_scaled = x_i * W_INV;
        let xy0        = mulhilo_sos3_corr(x_i, x_i_scaled, (*y).limbs[0]);
        let qi         = mulhilo_sos3_qi_lo(xy0.y, N0_SCALED, N0);
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
        let qi        = mulhilo_sos3_qi_lo(sum0_s.y, N0_SCALED, N0);
        let qi_scaled = qi * W_INV;

        let c_cancel = step(0.5, sum0_s.y);
        let qp0_lo   = c_cancel * (W - sum0_s.y);
        let qp0_hi   = fma(qi, p.limbs[0], -qp0_lo) * W_INV;

        let c_small   = c_cancel + sum0_s.x;
        let hi_pair   = xy0.x + qp0_hi;
        let carry_full = hi_pair + c_small;
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
