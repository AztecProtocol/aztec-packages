// 23-bit f32 mirror of `field.template.wgsl`. Inputs/outputs are in
// Montgomery form for the f32 ring: R_f = 2^(NUM_LIMBS_F32 * 23) mod p
// = 2^276 mod p. Add/sub act identically on Mont and canonical forms
// because R is linear; multiplication is `a * b * R_f^-1 mod p` via
// `montgomery_product_f32`.

fn fr_reduce_f32(a: ptr<function, BigIntF32>) -> BigIntF32 {
    var res: BigIntF32;
    var p: BigIntF32 = get_p_f32();
    let borrow = bigint_f32_sub(a, &p, &res);
    if (borrow > 0.5) {
        // a < p: subtract underflowed. Return original.
        return *a;
    }
    return res;
}

fn fr_add_f32(a: ptr<function, BigIntF32>, b: ptr<function, BigIntF32>) -> BigIntF32 {
    var res: BigIntF32;
    let _carry = bigint_f32_add(a, b, &res);
    return fr_reduce_f32(&res);
}

fn fr_double_f32(a: ptr<function, BigIntF32>) -> BigIntF32 {
    return fr_add_f32(a, a);
}

fn fr_sub_f32(a: ptr<function, BigIntF32>, b: ptr<function, BigIntF32>) -> BigIntF32 {
    var res: BigIntF32;

    // Short-circuit a == b to canonical 0 (mirrors the u32 path's reason:
    // the "a < b" branch below would otherwise return p - (b - a) = p - 0,
    // breaking is_zero() checks downstream).
    if (bigint_f32_eq(a, b)) {
        return res;
    }

    if (!bigint_f32_gt(a, b)) {
        var r: BigIntF32;
        let _b1 = bigint_f32_sub(b, a, &r);
        var p = get_p_f32();
        let _b2 = bigint_f32_sub(&p, &r, &res);
        return res;
    } else {
        let _b3 = bigint_f32_sub(a, b, &res);
        return res;
    }
}

// (p - a) mod p. Distinguishes a == 0 to return 0, not p.
fn fr_neg_f32(a: ptr<function, BigIntF32>) -> BigIntF32 {
    var res: BigIntF32;
    if (bigint_f32_is_zero(a)) {
        return res;
    }
    var p = get_p_f32();
    let _borrow = bigint_f32_sub(&p, a, &res);
    return res;
}

fn fr_mul_f32(a: ptr<function, BigIntF32>, b: ptr<function, BigIntF32>) -> BigIntF32 {
    return montgomery_product_f32(a, b);
}

fn fr_sqr_f32(a: ptr<function, BigIntF32>) -> BigIntF32 {
    return montgomery_product_f32(a, a);
}
