// 22-bit-limb f32 Montgomery product, SOS3 variant: 3-FMA mulhilo with a
// floor-barrier and a per-row `a_scaled = a * W_INV` precompute.
//
// vs the baseline SOS / 9-op mulhilo:
//
//   baseline (per (i,j) pair): 9 ops mulhilo (FMA + mul + floor + sub + mul
//   + FMA + step + sub + FMA-underflow) + 2 accumulates = 11 ops.
//
//   sos3 (per (i,j) pair): 4 ops mulhilo (FMA + floor + FMA + FMA) + 1 sub
//   to recover hi + 2 accumulates = 7 ops. Plus 1 op precompute per row
//   (`x_i * W_INV`) shared across all NUM_LIMBS inner-j calls.
//
// === Math ===
//
//   Per-row precompute:   a_scaled = a * W_INV      // exact: W is 2^22.
//
//   1) Hi_off_inner = fma(a_scaled, b, W)
//        = a*b/W + W, rounded at ULP=1 in the binade [W, 2W) = [2^22, 2^23),
//        so the FMA result is *integer-valued* by construction.
//
//   2) Hi_off = floor(Hi_off_inner)
//        Mathematically a no-op (Hi_off_inner is already integer), but
//        REQUIRED as a fast-math barrier. Without it the compiler can
//        algebraically simplify
//            fma(a, b, fma(-W, fma(a_scaled, b, W), BIAS))
//          = a*b + (-W*(a*b/W + W) + W^2)
//          = a*b + (-a*b - W^2 + W^2)
//          = 0
//        which is the same cancellation pattern that kills Emmart's c4
//        dance. floor() is opaque to fast-math algebra and breaks the
//        chain.
//
//   3) neg_hi_W = fma(-W, Hi_off, BIAS)
//        = -W*Hi_off + W^2  (BIAS = W^2 = 2^44).
//        Since Hi_off = hi + W (where hi = round(a*b/W)), this collapses to
//        -W*(hi + W) + W^2 = -W*hi exactly.
//        Both operands are integer multiples of 2^21 in the f32 grid, so
//        the result is exact in f32 even under fast-math double-rounding
//        (Sterbenz: result magnitude ≤ either input).
//
//   4) lo = fma(a, b, neg_hi_W) = a*b - W*hi.
//        Under single-rounded FMA: lo ∈ [0, W) exactly.
//        Under fast-math (split mul + add): lo ∈ (-W, W) signed — Hi_off
//        may be off by ±1 from the floor of a*b/W due to double-rounding
//        of the inner a_scaled*b. This matches the existing 6-op variant's
//        worst case, but we DROP the explicit step()-based underflow
//        correction and let the per-row floor-based drain (`acc_drain`)
//        absorb the signed values directly.
//
// === Accumulator ===
//
// Column slots `t.v[k]` (f32) accumulate signed contributions from the row
// (lo in (-W, W), hi in [0, W)) plus the previous drain's residue in
// [0, W). Per-row bound: |t.v[k]| ≤ 3W ≈ 2^23.6, which fits in f32's
// 24-bit mantissa exactly. `acc_drain` (floor + fma) handles signed input
// correctly: floor of a negative value returns the negative integer carry,
// which propagates to the next column.
//
// Carry-out of the final per-row drain is added unconditionally (no
// `if (carry > 0.5)` guard — that guard silently drops negative carries,
// which would corrupt the result under fast-math signed-lo behavior).

const NUM_LIMBS: u32 = {{ num_limbs }}u;
const N0: f32        = {{ n0 }};

fn get_p_f32() -> BigIntF32 {
    var p: BigIntF32;
{{{ p_limbs_f32 }}}
    return p;
}

// Floor-based drain. Handles signed input correctly.
fn acc_drain(x: f32) -> vec2<f32> {
    let hi = floor(x * W_INV);
    let lo = fma(-hi, W, x);
    return vec2<f32>(hi, lo);
}

// 4-op mulhilo. Caller pre-scales `a` to `a_scaled = a * W_INV`. Returns
// (hi, lo) with a*b = hi*W + lo (mod sign of lo under fast-math).
fn mulhilo_sos3(a: f32, a_scaled: f32, b: f32) -> vec2<f32> {
    let hi_off_inner = fma(a_scaled, b, W);
    let hi_off       = floor(hi_off_inner);      // fast-math barrier
    let neg_hi_w     = fma(-W, hi_off, BIAS);    // = -W*hi (BIAS = W^2)
    let lo           = fma(a, b, neg_hi_w);      // = a*b - W*hi
    let hi           = hi_off - W;
    return vec2<f32>(hi, lo);
}

struct WideAcc {
    v: array<f32, 25>,
}

fn montgomery_product_f32_sos3_unreduced(x: ptr<function, BigIntF32>, y: ptr<function, BigIntF32>) -> BigIntF32 {
    var t: WideAcc;
    for (var k = 0u; k < 25u; k = k + 1u) {
        t.v[k] = 0.0;
    }
    var p = get_p_f32();

    // === Phase 1: T = x * y, row-by-row ===
    for (var i = 0u; i < NUM_LIMBS; i = i + 1u) {
        let x_i        = (*x).limbs[i];
        let x_i_scaled = x_i * W_INV;            // 1 op per row, 12 calls share it
        for (var j = 0u; j < NUM_LIMBS; j = j + 1u) {
            let mh = mulhilo_sos3(x_i, x_i_scaled, (*y).limbs[j]);
            t.v[i + j]      = t.v[i + j]      + mh.y;
            t.v[i + j + 1u] = t.v[i + j + 1u] + mh.x;
        }
        var carry: f32 = 0.0;
        for (var k = i; k <= i + NUM_LIMBS; k = k + 1u) {
            let sum = t.v[k] + carry;
            let d   = acc_drain(sum);
            t.v[k]  = d.y;
            carry   = d.x;
        }
        // Unconditional carry-out — signed lo can produce negative carry
        // that must propagate (the `if (carry > 0.5)` guard in baseline SOS
        // would silently drop those).
        t.v[i + NUM_LIMBS + 1u] = t.v[i + NUM_LIMBS + 1u] + carry;
    }

    // === Phase 2: Montgomery reduce ===
    for (var i = 0u; i < NUM_LIMBS; i = i + 1u) {
        // qi extraction: use the baseline mulhilo so qi ∈ [0, W) (the
        // baseline includes the step()-based underflow correction). One
        // call per reduce iter, so the saving from sos3 here is marginal
        // and we'd rather have a canonical qi to keep the inner mulhilo's
        // `qi_scaled` non-negative.
        let qi_mh    = mulhilo(t.v[i], N0);
        let qi       = qi_mh.y;
        let qi_scaled = qi * W_INV;              // 1 op per reduce iter
        for (var j = 0u; j < NUM_LIMBS; j = j + 1u) {
            let mh = mulhilo_sos3(qi, qi_scaled, p.limbs[j]);
            t.v[i + j]      = t.v[i + j]      + mh.y;
            t.v[i + j + 1u] = t.v[i + j + 1u] + mh.x;
        }
        var carry: f32 = 0.0;
        for (var k = i; k <= i + NUM_LIMBS; k = k + 1u) {
            let sum = t.v[k] + carry;
            let d   = acc_drain(sum);
            t.v[k]  = d.y;
            carry   = d.x;
        }
        t.v[i + NUM_LIMBS + 1u] = t.v[i + NUM_LIMBS + 1u] + carry;
    }

    var result: BigIntF32;
    for (var i = 0u; i < NUM_LIMBS; i = i + 1u) {
        result.limbs[i] = t.v[NUM_LIMBS + i];
    }
    return result;
}

fn montgomery_product_f32_unreduced(x: ptr<function, BigIntF32>, y: ptr<function, BigIntF32>) -> BigIntF32 {
    return montgomery_product_f32_sos3_unreduced(x, y);
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
