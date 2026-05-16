// 22-bit-limb variant of `mont_pro_product_f32.template.wgsl`. Same
// CIOS Montgomery product, but with W = 2^22 (not 2^23). The smaller
// limb width buys us a critical property: the 4-way sum
//   s[j] + xy_lo + qp_lo + c_lo
// fits in [0, 4W) = [0, 2^24), exactly representable in f32's 24-bit
// mantissa. We can therefore replace the 23-bit cascade (multiple
// 2-way splits per inner iter) with a single 4-way add + single
// bias_split call. Net: ~5 fewer f32 ops per inner iter.
//
// W, W_INV, BIAS come from `mulhilo_22.wgsl` — do not redeclare here.
// This file is only included alongside the 22-bit mulhilo bundle; do
// NOT include it together with the 23-bit `mulhilo.wgsl`.
const NUM_LIMBS: u32 = {{ num_limbs }}u;
const N0: f32        = {{ n0 }};

fn get_p_f32() -> BigIntF32 {
    var p: BigIntF32;
{{{ p_limbs_f32 }}}
    return p;
}

// Split an integer-valued f32 x in [0, 2*W) into (hi, lo) with
// x = hi * W + lo, hi ∈ {0, 1}, lo ∈ [0, W). step()-based form.
fn bias_split_f32_le2w(x: f32) -> vec2<f32> {
    let hi = step(W, x);
    let lo = fma(-hi, W, x);
    return vec2<f32>(hi, lo);
}

// Split an integer-valued f32 x in [0, 3*W) into (hi, lo) with
// x = hi * W + lo, hi ∈ {0, 1, 2}, lo ∈ [0, W).
fn bias_split_f32_le3w(x: f32) -> vec2<f32> {
    let hi = step(W, x) + step(2.0 * W, x);
    let lo = fma(-hi, W, x);
    return vec2<f32>(hi, lo);
}

// Split an integer-valued f32 x in [0, 4*W] into (hi, lo) with
// x = hi * W + lo, hi ∈ {0, 1, 2, 3}, lo ∈ [0, W).
//
// floor-based form (vs. the step-based forms above). For x in
// [0, 4W) = [0, 2^24), `x * W_INV` is exact (mult by power of 2)
// and `floor(...)` returns an integer in {0,1,2,3}. f32 represents
// all integers ≤ 2^24 exactly, so the subtraction is also exact.
fn bias_split_f32_le4w(x: f32) -> vec2<f32> {
    let hi = floor(x * W_INV);
    let lo = fma(-hi, W, x);
    return vec2<f32>(hi, lo);
}

// CIOS Montgomery product over 22-bit f32 limbs, returning the result
// in [0, 2p) without the final conditional reduce. Useful for chained
// Mont products where canonical output is only required at the end;
// the algorithm is closed over inputs in [0, 2p) since each limb is
// still < W. Top limb < W follows from Mont invariant (result < 2p ≪
// W^N implies c_hi=0).
fn montgomery_product_f32_unreduced(x: ptr<function, BigIntF32>, y: ptr<function, BigIntF32>) -> BigIntF32 {
    var s: BigIntF32;
    var p = get_p_f32();

    // === Outer iter i=0: special-cased, s.limbs[*] treated as zero. ===
    {
        let i = 0u;
        let xy0 = mulhilo((*x).limbs[i], (*y).limbs[0]);
        // sum0 = 0 + xy0.y = xy0.y, already < W. No split needed.
        let qi = mulhilo(xy0.y, N0).y;

        // Mont invariant at position 0: xy0.y + qp0.y ≡ 0 (mod W) with
        // both < W. So qp0_lo = (W - xy0.y) if xy0.y > 0 else 0, and
        // the low cancels, contributing a 0/1 carry to the hi accumulator.
        let c_cancel = step(0.5, xy0.y);                       // 1 iff xy0.y > 0
        let qp0_lo = c_cancel * (W - xy0.y);
        let qp0_hi = fma(qi, p.limbs[0], -qp0_lo) * W_INV;     // < W

        let hi_pair = xy0.x + qp0_hi;                          // < 2W
        let carry_full = hi_pair + c_cancel;                   // < 2W + 1
        let carry_s = bias_split_f32_le2w(carry_full);
        var c_hi = carry_s.x;                                  // ∈ {0, 1}
        var c_lo = carry_s.y;                                  // < W

        // Inner loop: positions 1 .. NUM_LIMBS - 1 (general, no shortcut).
        // s[j] is implicit zero for i=0, so the 4-way sum collapses to 3.
        for (var j = 1u; j < NUM_LIMBS; j ++) {
            let mh = mulhilo2(vec2<f32>((*x).limbs[i], qi),
                              vec2<f32>((*y).limbs[j], p.limbs[j]));
            let xy_hi = mh.x;
            let xy_lo = mh.y;
            let qp_hi = mh.z;
            let qp_lo = mh.w;

            // 3-way sum (s[j]=0 implicit). All three operands < W, sum < 3W < 2^24.
            let low_sum = xy_lo + qp_lo + c_lo;
            let low_s = bias_split_f32_le3w(low_sum);
            s.limbs[j - 1u] = low_s.y;

            // New carry: xy_hi + qp_hi + low_s.x + c_hi.
            // xy_hi, qp_hi < W; low_s.x ∈ {0,1,2}; c_hi ∈ {0,1,2}. Sum < 2W + 4.
            let carry_total = xy_hi + qp_hi + low_s.x + c_hi;
            let carry_s2 = bias_split_f32_le3w(carry_total);
            c_hi = carry_s2.x;
            c_lo = carry_s2.y;
        }
        // Mont invariant: total result < 2p ≪ W^N, so c_hi=0 at end.
        // Defensive: emit fma in case the bound is tight.
        s.limbs[NUM_LIMBS - 1u] = fma(c_hi, W, c_lo);
    }

    // === Outer iter i=1..NUM_LIMBS-1 ===
    for (var i = 1u; i < NUM_LIMBS; i ++) {
        // === Position 0 ===
        let xy0 = mulhilo((*x).limbs[i], (*y).limbs[0]);
        // sum0 = s[0] + xy0.y, both < W -> sum < 2W, exact.
        let sum0 = s.limbs[0] + xy0.y;
        let sum0_s = bias_split_f32_le2w(sum0);
        let qi = mulhilo(sum0_s.y, N0).y;

        // Mont invariant: sum0_s.y + qp0.y ≡ 0 (mod W), both < W.
        let c_cancel = step(0.5, sum0_s.y);
        let qp0_lo = c_cancel * (W - sum0_s.y);
        let qp0_hi = fma(qi, p.limbs[0], -qp0_lo) * W_INV;

        let c_small = c_cancel + sum0_s.x;                     // ∈ {0, 1, 2}
        let hi_pair = xy0.x + qp0_hi;                          // < 2W
        let carry_full = hi_pair + c_small;                    // < 2W + 2
        let carry_s = bias_split_f32_le3w(carry_full);
        var c_hi = carry_s.x;                                  // ∈ {0, 1, 2}
        var c_lo = carry_s.y;                                  // < W

        // === Inner loop: positions 1 .. NUM_LIMBS - 1 (general) ===
        for (var j = 1u; j < NUM_LIMBS; j ++) {
            let mh = mulhilo2(vec2<f32>((*x).limbs[i], qi),
                              vec2<f32>((*y).limbs[j], p.limbs[j]));
            let xy_hi = mh.x;
            let xy_lo = mh.y;
            let qp_hi = mh.z;
            let qp_lo = mh.w;

            // 4-way sum. All four operands < W. Sum < 4W = 2^24, exact in
            // f32 mantissa. ONE split, no cascade.
            let low_sum = s.limbs[j] + xy_lo + qp_lo + c_lo;
            let low_s = bias_split_f32_le4w(low_sum);
            s.limbs[j - 1u] = low_s.y;

            // New carry: xy_hi + qp_hi + low_s.x + c_hi.
            // xy_hi, qp_hi < W; low_s.x ∈ {0,1,2,3}; c_hi ∈ {0,1,2}.
            // Sum < 2W + 5 < 3W (for W >= 6), use the 3W split.
            let carry_total = xy_hi + qp_hi + low_s.x + c_hi;
            let carry_s2 = bias_split_f32_le3w(carry_total);
            c_hi = carry_s2.x;
            c_lo = carry_s2.y;
        }

        // Mont invariant: c_hi = 0 at end (result < 2p).
        s.limbs[NUM_LIMBS - 1u] = fma(c_hi, W, c_lo);
    }

    return s;
}

// CIOS Montgomery product over 22-bit f32 limbs. The 22-bit width is
// chosen so that 4*W = 2^24 fits in the f32 mantissa exactly — this
// lets the inner loop add `s[j] + xy_lo + qp_lo + c_lo` in one shot
// (vs. cascading per-pair splits at 23-bit).
//
// Note: the 22-bit BN254 modulus has p.limbs[N-1] = 3097 (NOT 1), so
// the 23-bit's top-limb shortcut does not apply. We run the general
// case at j=N-1. Mont invariant guarantees the final s[N-1] < W (the
// result is < 2p ≪ W * W^(N-1)).
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
