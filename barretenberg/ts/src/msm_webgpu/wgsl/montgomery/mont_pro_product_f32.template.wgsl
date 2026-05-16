// W, W_INV, BIAS come from `mulhilo.wgsl` — do not redeclare here.
const NUM_LIMBS: u32 = {{ num_limbs }}u;
const N0: f32        = {{ n0 }};

fn get_p_f32() -> BigIntF32 {
    var p: BigIntF32;
{{{ p_limbs_f32 }}}
    return p;
}

// Split an integer-valued f32 x with 0 <= x <= 2*W into (hi, lo) such
// that x = hi * W + lo, lo in [0, W).
//
// Implementation note. An earlier version of this used the FMA-bias
// rounding trick: `q = fma(x, 1.0, BIAS) - BIAS`. That formulation is
// algebraically equivalent to `x` under IEEE-754-with-fast-math
// reassociation, and Apple Metal's MSL backend (which defaults to
// `-ffast-math`) silently rewrites `(x + BIAS) - BIAS` to `x` for
// runtime f32 variables — producing q=x and lo=0 instead of q=0 and
// lo=x. Constant inputs survive because the compiler folds them at
// constexpr time using strict IEEE rules. `mulhilo` is unaffected by
// the same simplification: `fma(a, b, BIAS) - BIAS` is not trivially
// `a*b` to the compiler when `b != 1.0`.
//
// The `floor(x * W_INV)` form below cannot be algebraically simplified
// — `floor` is not arithmetic, so fast-math leaves it alone. For x in
// [0, 2*W] (all integer-valued), `x * W_INV` is exact (multiplication
// by a power of two), `floor(...)` returns the exact integer hi in
// {0, 1, 2}, and `lo = x - hi * W` is exact in f32 since both operands
// are integers <= 2^24.
fn bias_split_f32(x: f32) -> vec2<f32> {
    let hi = floor(x * W_INV);
    let lo = fma(-hi, W, x);
    return vec2<f32>(hi, lo);
}

// Tighter variant for x in [0, 2W): hi is 0 or 1, so we can use step()
// instead of floor(x*W_INV). Saves one multiplication per call.
fn bias_split_f32_le2w(x: f32) -> vec2<f32> {
    let hi = step(W, x);
    let lo = fma(-hi, W, x);
    return vec2<f32>(hi, lo);
}

// Tighter variant for x in [0, 3W): hi is 0, 1, or 2. Two step calls
// at thresholds W and 2W. Sum the two indicators.
fn bias_split_f32_le3w(x: f32) -> vec2<f32> {
    let hi = step(W, x) + step(2.0 * W, x);
    let lo = fma(-hi, W, x);
    return vec2<f32>(hi, lo);
}

// CIOS Montgomery product over 23-bit f32 limbs. f32's 24-bit mantissa
// cannot hold the deferred-carry accumulators the mitschabaude u32
// algorithm uses, so we propagate carries per step. Every f32 in the
// inner loop is an integer-valued operand strictly bounded by 2*W,
// which guarantees plain `+` is exact: f32 represents all integers in
// [0, 2^24] = [0, 2*W] exactly.
//
// Inner-loop invariant: the running carry is held as a pair
//   carry = c_hi * W + c_lo,  c_hi in {0, 1, 2},  c_lo in [0, W)
// so it never gets folded into a single >=2^24 value. The 4-way
// addition s[j] + xyj_lo + qpj_lo + c_lo is staged into three 2-way
// adds with bias splits between each — each intermediate stays < 2*W.
fn montgomery_product_f32(x: ptr<function, BigIntF32>, y: ptr<function, BigIntF32>) -> BigIntF32 {
    var s: BigIntF32;
    // Note: s.limbs[*] is NOT pre-initialized to zero. The i=0 outer iter
    // is special-cased below to write s.limbs[k] before any read.
    var p = get_p_f32();

    // === Outer iter i=0: special-cased, treats s.limbs[*] as implicit zero ===
    {
        let i = 0u;
        let xy0 = mulhilo((*x).limbs[i], (*y).limbs[0]);
        let sum0 = xy0.y;                                   // s[0]=0 implicit
        let sum0_s = bias_split_f32_le2w(sum0);
        let qi = mulhilo(sum0_s.y, N0).y;
        let c_cancel = step(0.5, sum0_s.y);
        let qp0_lo = c_cancel * (W - sum0_s.y);
        let qp0_hi = fma(qi, p.limbs[0], -qp0_lo) * W_INV;
        let c_small = c_cancel + sum0_s.x;
        let hi_pair = xy0.x + qp0_hi;
        let carry_full = hi_pair + c_small;
        let carry_s = bias_split_f32(carry_full);
        var c_hi = carry_s.x;
        var c_lo = carry_s.y;

        for (var j = 1u; j < NUM_LIMBS - 1u; j ++) {
            let mh = mulhilo2(vec2<f32>((*x).limbs[i], qi),
                              vec2<f32>((*y).limbs[j], p.limbs[j]));
            let xy_hi = mh.x;
            let xy_lo = mh.y;
            let qp_hi = mh.z;
            let qp_lo = mh.w;
            let xy_qp = xy_lo + qp_lo;
            let s_c = c_lo;                                 // s[j]=0 implicit
            let xy_qp_s = bias_split_f32_le2w(xy_qp);
            let s_c_s = bias_split_f32_le2w(s_c);
            let combined = xy_qp_s.y + s_c_s.y;
            let combined_s = bias_split_f32_le2w(combined);
            s.limbs[j - 1u] = combined_s.y;
            let sum_overflow = xy_qp_s.x + s_c_s.x + combined_s.x + c_hi;
            let nc1 = xy_hi + qp_hi;
            let nc1_s = bias_split_f32_le2w(nc1);
            let new_lo = nc1_s.y + sum_overflow;
            let overflow_bit = step(W, new_lo);
            c_hi = nc1_s.x + overflow_bit;
            c_lo = fma(-overflow_bit, W, new_lo);
        }

        {
            let xyj = mulhilo((*x).limbs[i], (*y).limbs[NUM_LIMBS - 1u]);
            let xy_hi = xyj.x;
            let xy_lo = xyj.y;
            let s_xy = xy_lo;                               // s[N-1]=0 implicit
            let qi_c = qi + c_lo;
            let s_xy_s = bias_split_f32_le2w(s_xy);
            let qi_c_s = bias_split_f32_le2w(qi_c);
            let combined = s_xy_s.y + qi_c_s.y;
            let combined_s = bias_split_f32_le2w(combined);
            s.limbs[NUM_LIMBS - 2u] = combined_s.y;
            let sum_overflow = s_xy_s.x + qi_c_s.x + combined_s.x + c_hi;
            s.limbs[NUM_LIMBS - 1u] = xy_hi + sum_overflow;
        }
    }

    // === Outer iter i=1..NUM_LIMBS-1 ===
    for (var i = 1u; i < NUM_LIMBS; i ++) {
        // === Position 0 ===
        let xy0 = mulhilo((*x).limbs[i], (*y).limbs[0]);
        // sum0 = s[0] + xy0_lo  in [0, 2W). Both summands < W -> exact f32 add.
        let sum0 = s.limbs[0] + xy0.y;
        // Split sum0 so qi sees a 23-bit operand. sum0 < 2W so use the
        // tighter step()-based split.
        let sum0_s = bias_split_f32_le2w(sum0);
        // qi = (sum0_lo * N0) mod W. mulhilo's `.y` returns the low 23 bits.
        let qi = mulhilo(sum0_s.y, N0).y;

        // Mont invariant: sum0_s.y + qp0.y ≡ 0 (mod W) with both < W.
        // So qp0.y = (W - sum0_s.y) if sum0_s.y > 0, else 0; and the
        // low-cancel carry is (sum0_s.y > 0). We can therefore compute
        // qp0.x without a full mulhilo: qp0_hi = (qi * p[0] - qp0_lo) / W
        // and the FMA produces an exact multiple of W.
        let c_cancel = step(0.5, sum0_s.y);                 // 1 iff sum0_s.y > 0
        let qp0_lo = c_cancel * (W - sum0_s.y);             // (W - sum0_s.y) if sum0_s.y > 0, else 0
        let qp0_hi = fma(qi, p.limbs[0], -qp0_lo) * W_INV;  // < W

        let c_small = c_cancel + sum0_s.x;                  // in {0, 1, 2}, exact.
        let hi_pair = xy0.x + qp0_hi;                       // < 2W, exact.
        let carry_full = hi_pair + c_small;                 // <= 2W+2 < 3W, exact.
        let carry_s = bias_split_f32(carry_full);           // c_hi in {0,1,2}, c_lo < W.
        var c_hi = carry_s.x;
        var c_lo = carry_s.y;

        // === Inner loop: positions 1 .. NUM_LIMBS - 2 ===
        // Last iter (j=NUM_LIMBS-1) is special-cased below: for BN254
        // p.limbs[N-1]=1, so mulhilo(qi, 1) = (0, qi), and the Mont
        // invariant forces final c_hi=0. This saves one mulhilo, one
        // bias_split round (nc1, nc2), and the c_hi*W+c_lo final fma.
        for (var j = 1u; j < NUM_LIMBS - 1u; j ++) {
            // Vec2 mulhilo: compute xyj and qpj in parallel. The compiler
            // gets the chance to vectorize the two FMAs / floors.
            let mh = mulhilo2(vec2<f32>((*x).limbs[i], qi),
                              vec2<f32>((*y).limbs[j], p.limbs[j]));
            let xy_hi = mh.x;
            let xy_lo = mh.y;
            let qp_hi = mh.z;
            let qp_lo = mh.w;

            // Parallel-stage 4-way add: split (xy_lo + qp_lo) and
            // (s[j] + c_lo) independently. Pairing the two product-lows
            // together leaves an entirely-product dependency chain on
            // one side and an entirely-state chain on the other,
            // breaking up the per-iter dep graph.
            let xy_qp = xy_lo + qp_lo;                      // < 2W
            let s_c = s.limbs[j] + c_lo;                    // < 2W
            let xy_qp_s = bias_split_f32_le2w(xy_qp);
            let s_c_s = bias_split_f32_le2w(s_c);
            let combined = xy_qp_s.y + s_c_s.y;             // < 2W
            let combined_s = bias_split_f32_le2w(combined);

            // Final low 23 bits of position j go into s[j-1] (CIOS shift).
            s.limbs[j - 1u] = combined_s.y;

            let sum_overflow = xy_qp_s.x + s_c_s.x + combined_s.x + c_hi;

            // New carry: nc1 = xy_hi + qp_hi < 2W. Split, then add
            // sum_overflow to the low part and use a step() to extract
            // any overflow into c_hi.
            let nc1 = xy_hi + qp_hi;
            let nc1_s = bias_split_f32_le2w(nc1);
            let new_lo = nc1_s.y + sum_overflow;           // < W + 6 < 2W
            let overflow_bit = step(W, new_lo);            // 1 iff new_lo >= W
            c_hi = nc1_s.x + overflow_bit;                  // ∈ {0,1,2}
            c_lo = fma(-overflow_bit, W, new_lo);           // < W
        }

        // === Position NUM_LIMBS - 1 (special): p.limbs[N-1] == 1 ===
        // qp = (0, qi) skips a mulhilo. By the Mont invariant the final
        // c_hi=0, so we skip the nc1/nc2 splits and the final
        // fma(c_hi, W, c_lo).
        {
            let xyj = mulhilo((*x).limbs[i], (*y).limbs[NUM_LIMBS - 1u]);
            let xy_hi = xyj.x;
            let xy_lo = xyj.y;

            // Parallel-stage 4-way add: s[N-1] + xy_lo + qi + c_lo.
            let s_xy = s.limbs[NUM_LIMBS - 1u] + xy_lo;     // < 2W
            let qi_c = qi + c_lo;                            // < 2W (both < W)
            let s_xy_s = bias_split_f32_le2w(s_xy);
            let qi_c_s = bias_split_f32_le2w(qi_c);
            let combined = s_xy_s.y + qi_c_s.y;             // < 2W
            let combined_s = bias_split_f32_le2w(combined);
            s.limbs[NUM_LIMBS - 2u] = combined_s.y;
            let sum_overflow = s_xy_s.x + qi_c_s.x + combined_s.x + c_hi;

            // c_final = xy_hi + sum_overflow (qp_hi=0). Mont invariant:
            // total < W, exactly representable; this becomes s.limbs[N-1].
            s.limbs[NUM_LIMBS - 1u] = xy_hi + sum_overflow;
        }
    }

    return conditional_reduce_f32(&s, &p);
}

fn conditional_reduce_f32(x: ptr<function, BigIntF32>, y: ptr<function, BigIntF32>) -> BigIntF32 {
    // Reduce on == as well as >. Identical to the u32 path's rationale:
    // a value-zero-but-limbs-equal-p output breaks downstream is_zero()
    // checks. Reducing on equality canonicalises into [0, p).
    if (bigint_f32_gt(x, y) || bigint_f32_eq(x, y)) {
        var res: BigIntF32;
        let _borrow = bigint_f32_sub(x, y, &res);
        return res;
    }
    return *x;
}
