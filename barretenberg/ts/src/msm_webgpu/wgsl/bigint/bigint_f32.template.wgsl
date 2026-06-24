// f32-limb mirror of `bigint.template.wgsl`. Each limb holds an
// integer-valued f32 in [0, 2^WORD_SIZE_F32) = [0, W). Mirrors the
// subset of `bigint.template.wgsl` needed by `montgomery_product_f32`
// and the f32 field ops in `field/field_f32.template.wgsl` /
// `field/fr_pow_f32.template.wgsl`.

struct BigIntF32 {
    limbs: array<f32, {{ num_limbs }}>
}

fn bigint_f32_gt(x: ptr<function, BigIntF32>, y: ptr<function, BigIntF32>) -> bool {
    for (var idx = 0u; idx < {{ num_limbs }}u; idx ++) {
        let i = {{ num_limbs }}u - 1u - idx;
        if ((*x).limbs[i] < (*y).limbs[i]) { return false; }
        if ((*x).limbs[i] > (*y).limbs[i]) { return true; }
    }
    return false;
}

fn bigint_f32_eq(x: ptr<function, BigIntF32>, y: ptr<function, BigIntF32>) -> bool {
    for (var i = 0u; i < {{ num_limbs }}u; i ++) {
        if ((*x).limbs[i] != (*y).limbs[i]) { return false; }
    }
    return true;
}

// res = a - b. Per-limb borrow lives as an f32 in {0.0, 1.0};
// `step(diff, -0.5)` is 1.0 iff diff is a negative integer (i.e.,
// underflowed). Adding `underflow * W` then canonicalises the limb
// back into [0, W). Returns the final borrow-out (0.0 or 1.0): callers
// that need to know whether a >= b consult this flag, mirroring the
// u32 `bigint_sub`'s return convention.
fn bigint_f32_sub(a: ptr<function, BigIntF32>, b: ptr<function, BigIntF32>, res: ptr<function, BigIntF32>) -> f32 {
    var borrow: f32 = 0.0;
    for (var i = 0u; i < {{ num_limbs }}u; i ++) {
        let diff = (*a).limbs[i] - (*b).limbs[i] - borrow;
        let underflow = step(diff, -0.5);
        (*res).limbs[i] = diff + underflow * W;
        borrow = underflow;
    }
    return borrow;
}

// res = a + b. Per-limb carry lives as an f32 in {0.0, 1.0}; `step(W-0.5, sum)`
// is 1.0 iff sum >= W (the bias-free branchless test). Each sum is at most
// 2*(W-1) + 1 = 2^24 - 1, exact in the 24-bit f32 mantissa. Returns the
// final carry-out (0.0 or 1.0) for downstream conditional-reduce logic.
fn bigint_f32_add(a: ptr<function, BigIntF32>, b: ptr<function, BigIntF32>, res: ptr<function, BigIntF32>) -> f32 {
    var carry: f32 = 0.0;
    for (var i = 0u; i < {{ num_limbs }}u; i ++) {
        let sum = (*a).limbs[i] + (*b).limbs[i] + carry;
        let overflow = step(W - 0.5, sum);
        (*res).limbs[i] = sum - overflow * W;
        carry = overflow;
    }
    return carry;
}

fn bigint_f32_is_zero(x: ptr<function, BigIntF32>) -> bool {
    for (var i = 0u; i < {{ num_limbs }}u; i ++) {
        if ((*x).limbs[i] != 0.0) { return false; }
    }
    return true;
}
