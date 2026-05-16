// 22-bit-limb f32 Montgomery product, V2: wide column accumulator
// with two-bucket (acc_lo, acc_hi) storage and on-the-fly per-column
// draining. Removes the per-inner-j carry chain (c_lo / c_hi) of the
// V1 CIOS template; in V2 every inner-j add is independent across
// columns, giving the GPU more ILP in the inner loop.
//
// Layout. W = 2^22, NUM_LIMBS = 12. Wide accumulator has 2*N + 1 = 25
// columns. Each column k carries a value
//   true_value[k] = acc_lo[k] + acc_hi[k] * W
// with acc_lo[k] in [0, W) post-drain and acc_hi[k] holding the
// accumulated overflow count (max ~96 by end of computation, exactly
// representable in f32).
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

// Split an integer-valued f32 x in [0, 2*W) into (hi, lo).
fn bias_split_f32_le2w(x: f32) -> vec2<f32> {
    let hi = step(W, x);
    let lo = fma(-hi, W, x);
    return vec2<f32>(hi, lo);
}

// Split an integer-valued f32 x in [0, 4*W] into (hi, lo) with
// x = hi * W + lo, hi in {0, 1, 2, 3, 4}, lo in [0, W). floor-based:
// f32 represents all integers up to 2^24 = 4W exactly, so the sum
// `x * W_INV = x / 2^22` is exact and `floor` returns the right int.
fn bias_split_f32_le4w(x: f32) -> vec2<f32> {
    let hi = floor(x * W_INV);
    let lo = fma(-hi, W, x);
    return vec2<f32>(hi, lo);
}

// V2 CIOS Montgomery product, unreduced output in [0, 2p). Returns
// canonical BigIntF32 with limbs in [0, W). Conditional reduce is in
// the wrapper below.
//
// === Numerical invariants ===
//   At iter i start: acc_lo[k] in [0, W) for all touched k.
//   Mid-sweep keeps step-1 cols (i, i+1) < W before step 2.
//   In step 2, on-the-fly drain keeps each col < 4W after writes;
//   bias_split_f32_le4w handles up to 4W exactly.
fn montgomery_product_f32_unreduced(x: ptr<function, BigIntF32>, y: ptr<function, BigIntF32>) -> BigIntF32 {
    var p = get_p_f32();
    // Wide accumulator: 2*N + 1 = 25 columns. Explicitly zero-init.
    var acc_lo: array<f32, 25>;
    var acc_hi: array<f32, 25>;
    for (var k = 0u; k < 25u; k = k + 1u) {
        acc_lo[k] = 0.0;
        acc_hi[k] = 0.0;
    }

    for (var i = 0u; i < NUM_LIMBS; i = i + 1u) {
        // Pre-step: propagate acc_hi[i-1] into acc_lo[i]. Required for
        // qi correctness: the canonical limb at position i is
        // (acc_lo[i] + acc_hi[i-1]) mod W (since acc_hi[i-1] has weight
        // W^i, same as col i). acc_hi[i-1] is bounded by ~4 * i in the
        // worst case, well under W. Skip at i=0 (no prior col).
        // Clear acc_hi[i-1] after folding to avoid double-count at the
        // final collapse below.
        if (i > 0u) {
            acc_lo[i] = acc_lo[i] + acc_hi[i - 1u];
            acc_hi[i - 1u] = 0.0;
            let s = bias_split_f32_le4w(acc_lo[i]);
            acc_lo[i] = s.y;
            acc_hi[i] = acc_hi[i] + s.x;
        }

        // === Step 1: fused j=0 multiply + qi + reduce ===
        let xy0 = mulhilo((*x).limbs[i], (*y).limbs[0]);
        acc_lo[i] = acc_lo[i] + xy0.y;
        acc_lo[i + 1u] = acc_lo[i + 1u] + xy0.x;

        // Normalize col i (< 2W: prior < W plus xy0.y < W). bias_split_le2w
        // suffices. Spill norm.x into col i+1 (so far < 2W; spill makes it
        // < 2W + 1).
        let norm = bias_split_f32_le2w(acc_lo[i]);
        acc_lo[i] = norm.y;
        acc_lo[i + 1u] = acc_lo[i + 1u] + norm.x;

        let qi = mulhilo(norm.y, N0).y;
        let qp0 = mulhilo(qi, p.limbs[0]);
        acc_lo[i] = acc_lo[i] + qp0.y;       // now in {0, W} by Mont invariant
        acc_lo[i + 1u] = acc_lo[i + 1u] + qp0.x;  // < 3W + 1

        // === Mid-sweep: drain col i and col i+1 ===
        // col i is in {0, W} (sum cancels mod W). le2w fits.
        // col i+1 is < 3W + 1. le4w fits.
        let s_i = bias_split_f32_le2w(acc_lo[i]);
        acc_lo[i] = s_i.y;
        acc_hi[i] = acc_hi[i] + s_i.x;
        let s_i1 = bias_split_f32_le4w(acc_lo[i + 1u]);
        acc_lo[i + 1u] = s_i1.y;
        acc_hi[i + 1u] = acc_hi[i + 1u] + s_i1.x;

        // === Step 2: interleaved multiply + reduce, j = 1 .. N-1 ===
        // Each iter writes to col i+j (mh.y + mh.w) and col i+j+1
        // (mh.x + mh.z). On-the-fly drain both cols so they enter the
        // next iter in [0, W) — keeps every running sum < 4W.
        for (var j = 1u; j < NUM_LIMBS; j = j + 1u) {
            let mh = mulhilo2(vec2<f32>((*x).limbs[i], qi),
                              vec2<f32>((*y).limbs[j], p.limbs[j]));
            acc_lo[i + j] = acc_lo[i + j] + mh.y + mh.w;            // < W + 2W = 3W
            acc_lo[i + j + 1u] = acc_lo[i + j + 1u] + mh.x + mh.z;  // < W + 2W = 3W
            let s_a = bias_split_f32_le4w(acc_lo[i + j]);
            acc_lo[i + j] = s_a.y;
            acc_hi[i + j] = acc_hi[i + j] + s_a.x;
            let s_b = bias_split_f32_le4w(acc_lo[i + j + 1u]);
            acc_lo[i + j + 1u] = s_b.y;
            acc_hi[i + j + 1u] = acc_hi[i + j + 1u] + s_b.x;
        }
    }

    // === Final: collapse acc_hi[] into acc_lo[] via single serial
    // carry chain. acc_hi[k] represents the count of W's overflowed
    // from col k; its weight is W^(k+1) so we add it to acc_lo[k+1].
    for (var k = 0u; k < 2u * NUM_LIMBS; k = k + 1u) {
        let combined = acc_lo[k + 1u] + acc_hi[k];
        let s = bias_split_f32_le4w(combined);
        acc_lo[k + 1u] = s.y;
        acc_hi[k + 1u] = acc_hi[k + 1u] + s.x;
    }

    // Mont result lives in cols [N, 2N-1]. Pack into BigIntF32.
    var s: BigIntF32;
    for (var k = 0u; k < NUM_LIMBS; k = k + 1u) {
        s.limbs[k] = acc_lo[NUM_LIMBS + k];
    }
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
