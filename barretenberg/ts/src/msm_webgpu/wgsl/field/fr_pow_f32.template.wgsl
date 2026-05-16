// 23-bit f32 mirror of `fr_pow.template.wgsl`. All values are in
// Montgomery form for the f32 ring (R_f = 2^276 mod p). Multiplicative
// identity is R_f itself (since x * R_f stores integer x; 1 * R_f = R_f).
//
// Inversion here uses Fermat's little theorem (a^(p-2) = a^-1) via
// `fr_pow_f32` — square-and-multiply over 254 bits. The u32 path uses
// jumpy safegcd, which needs 2's complement signed limbs and arithmetic
// shifts — neither maps cleanly onto integer-valued f32 limbs. The
// Fermat path is mechanical to express in f32 and has the same
// asymptotic cost ~254 muls + ~120 squarings versus safegcd's ~62
// outer iterations of multi-limb signed arithmetic + 1 final Montgomery
// product. For 4a we prioritise correctness/coverage; perf-tuning
// f32 inversion is deferred until the curve/cuzk paths land.

fn get_r_f32() -> BigIntF32 {
    var r: BigIntF32;
{{{ r_limbs_f32 }}}
    return r;
}

// R^2 mod p, in the 23-bit f32 ring. Used to push canonical values up
// into Montgomery form via one `montgomery_product_f32`.
fn get_r_squared_f32() -> BigIntF32 {
    var r2: BigIntF32;
{{{ r_squared_limbs_f32 }}}
    return r2;
}

// (q + 1) / 4 — closed-form sqrt exponent for BN254 (p ≡ 3 mod 4).
// Stored as a BigIntF32 so we can walk its limb-level bits the same
// way `fr_pow_f32` walks an arbitrary exponent.
fn get_sqrt_exp_f32() -> BigIntF32 {
    var e: BigIntF32;
{{{ sqrt_exp_limbs_f32 }}}
    return e;
}

// p - 2 — Fermat exponent for `fr_inv_f32`. Same shape as the sqrt
// exponent (just a different value); kept inline rather than passed
// around to avoid an extra storage hop per inversion.
fn get_inv_exp_f32() -> BigIntF32 {
    var e: BigIntF32;
{{{ inv_exp_limbs_f32 }}}
    return e;
}

// Generic Montgomery-form exponentiation, square-and-multiply over the
// limb-level bits of `exp`. Bit i.j (limb i, bit j within the limb) is
// extracted by `u32(limb)` then `>> j & 1u` — exact because f32 limbs
// are integer-valued in [0, 2^23) and `u32(f32)` is the truncated cast.
fn fr_pow_f32(base: BigIntF32, exp: BigIntF32) -> BigIntF32 {
    var result: BigIntF32 = get_r_f32();
    var b: BigIntF32 = base;

    for (var i = 0u; i < {{ num_limbs }}u; i = i + 1u) {
        let limb_u32: u32 = u32(exp.limbs[i]);
        for (var j = 0u; j < 23u; j = j + 1u) {
            if (((limb_u32 >> j) & 1u) == 1u) {
                result = montgomery_product_f32(&result, &b);
            }
            b = montgomery_product_f32(&b, &b);
        }
    }
    return result;
}

// Field inversion via Fermat. See header comment for the safegcd
// trade-off discussion.
fn fr_inv_f32(a: BigIntF32) -> BigIntF32 {
    var exp = get_inv_exp_f32();
    return fr_pow_f32(a, exp);
}

// Closed-form square root for BN254 (p ≡ 3 mod 4). Returns one of the
// two square roots; the caller must check `s^2 == a` to discriminate
// QR vs non-QR.
fn fr_sqrt_f32(a: BigIntF32) -> BigIntF32 {
    var exp = get_sqrt_exp_f32();
    return fr_pow_f32(a, exp);
}

// Push a canonical (non-Montgomery) value into Montgomery form by one
// CIOS product with R^2: (a * R^2) * R^-1 mod p = a * R mod p.
fn to_mont_f32(a: ptr<function, BigIntF32>) -> BigIntF32 {
    var r2 = get_r_squared_f32();
    return montgomery_product_f32(a, &r2);
}

// Pull a Montgomery-form value back to canonical: (a * R) * R^-1 mod p
// = a mod p. We multiply by the limb-vector representation of 1
// (limbs[0] = 1, rest = 0); montgomery_product_f32 then strips R.
fn from_mont_f32(a: ptr<function, BigIntF32>) -> BigIntF32 {
    var one_native: BigIntF32;
    one_native.limbs[0] = 1.0;
    return montgomery_product_f32(a, &one_native);
}
