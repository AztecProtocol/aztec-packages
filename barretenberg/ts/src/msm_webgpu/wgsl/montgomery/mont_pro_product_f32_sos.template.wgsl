// 22-bit-limb f32 Montgomery product in SOS (Separated Operand Scanning)
// form. Two passes: (1) full schoolbook multiply T = x * y into a wide
// column accumulator, (2) per-limb Montgomery reduce. Each pass uses
// row-by-row accumulation with a single drain sweep at the end of each
// row, exploiting f32's exact integer arithmetic up to 2^24.
//
// Numerical layout. W = 2^22, NUM_LIMBS = 12. Each column slot
// `t.lo[k]` (k in 0..2N) holds an f32 in [0, 2^24); the invariant
// after each row's drain is `t.lo[k] in [0, W)`. During a row's
// accumulation the slot can transiently hold up to 3*W ≈ 2^23.6, which
// fits in f32's 24-bit mantissa without precision loss.
//
// W, W_INV, BIAS come from `mulhilo_22.wgsl` — do not redeclare here.
// This file is only included alongside the 22-bit mulhilo bundle.
const NUM_LIMBS: u32 = {{ num_limbs }}u;
const N0: f32        = {{ n0 }};

fn get_p_f32() -> BigIntF32 {
    var p: BigIntF32;
{{{ p_limbs_f32 }}}
    return p;
}

// Split an integer-valued f32 x in [0, 4*W] into (hi, lo) with
// x = hi * W + lo, hi ∈ {0, 1, 2, 3, 4}, lo ∈ [0, W). floor-based.
fn acc_drain(x: f32) -> vec2<f32> {
    let hi = floor(x * W_INV);
    let lo = fma(-hi, W, x);
    return vec2<f32>(hi, lo);
}

// Wide accumulator. We use 2N + 1 slots so the highest hi spillover
// from the multiply phase has a target.
struct WideAcc {
    v: array<f32, 25>,
}

// SOS Montgomery product. Result is in [0, 2p) (unreduced).
fn montgomery_product_f32_sos_unreduced(x: ptr<function, BigIntF32>, y: ptr<function, BigIntF32>) -> BigIntF32 {
    var t: WideAcc;
    for (var k = 0u; k < 25u; k = k + 1u) {
        t.v[k] = 0.0;
    }
    var p = get_p_f32();

    // === Phase 1: Multiply T = x * y, row-by-row ===
    //
    // For each row i in 0..N-1:
    //   Accumulate x[i] * y[j] for j = 0..N-1 into columns [i, i+N].
    //   Lo's flow into column i+j; hi's flow into column i+j+1.
    //   Each column receives at most 2 new contributions per row.
    //   Drain row's touched columns at end of row to restore lo bound.
    //
    // Bound: pre-row slot < W. 2 new < W contributions → < 3W after row.
    // 3W = 3 * 2^22 < 2^24 → exactly representable. Drain reduces to < W.
    for (var i = 0u; i < NUM_LIMBS; i = i + 1u) {
        // Accumulate row i.
        for (var j = 0u; j < NUM_LIMBS; j = j + 1u) {
            let mh = mulhilo((*x).limbs[i], (*y).limbs[j]);
            t.v[i + j] = t.v[i + j] + mh.y;
            t.v[i + j + 1u] = t.v[i + j + 1u] + mh.x;
        }
        // Drain columns [i, i+N] to restore lo < W invariant.
        // Sweep carry forward: each slot becomes lo, carry spills to next.
        var carry: f32 = 0.0;
        for (var k = i; k <= i + NUM_LIMBS; k = k + 1u) {
            let sum = t.v[k] + carry;
            let d = acc_drain(sum);
            t.v[k] = d.y;
            carry = d.x;
        }
        // After draining, carry should be 0 (Mont bound), but persist
        // it into the next slot just in case.
        if (carry > 0.5) {
            t.v[i + NUM_LIMBS + 1u] = t.v[i + NUM_LIMBS + 1u] + carry;
        }
    }

    // === Phase 2: Montgomery reduce ===
    //
    // For i in 0..N-1:
    //   qi = (t.v[i] * N0) mod W
    //   Add qi * p[j] to t.v[i + j] for j = 0..N-1
    //   (t.v[i] becomes ≡ 0 mod W by construction)
    //
    // After all iters, t.v[N..2N] is the Mont product (< 2p).
    for (var i = 0u; i < NUM_LIMBS; i = i + 1u) {
        let qi_mh = mulhilo(t.v[i], N0);
        let qi = qi_mh.y;

        for (var j = 0u; j < NUM_LIMBS; j = j + 1u) {
            let mh = mulhilo(qi, p.limbs[j]);
            t.v[i + j] = t.v[i + j] + mh.y;
            t.v[i + j + 1u] = t.v[i + j + 1u] + mh.x;
        }
        // Drain columns [i, i+N+1] (carry can extend one more slot).
        var carry: f32 = 0.0;
        for (var k = i; k <= i + NUM_LIMBS; k = k + 1u) {
            let sum = t.v[k] + carry;
            let d = acc_drain(sum);
            t.v[k] = d.y;
            carry = d.x;
        }
        if (carry > 0.5) {
            t.v[i + NUM_LIMBS + 1u] = t.v[i + NUM_LIMBS + 1u] + carry;
        }
    }

    var result: BigIntF32;
    for (var i = 0u; i < NUM_LIMBS; i = i + 1u) {
        result.limbs[i] = t.v[NUM_LIMBS + i];
    }
    return result;
}

fn montgomery_product_f32_unreduced(x: ptr<function, BigIntF32>, y: ptr<function, BigIntF32>) -> BigIntF32 {
    return montgomery_product_f32_sos_unreduced(x, y);
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
