// Field exponentiation in Montgomery form.
//
// Inputs/outputs are in Montgomery form. The Montgomery representative
// of 1 is R itself (since x*R mod p stores the integer x; 1*R = R), so
// `get_r()` is the multiplicative identity here.

// Generic Montgomery-form exponentiation: square-and-multiply over the
// limb-level bits of `exp`. The sole caller is G1 point decompression
// (`decompress_g1_bn254`), which raises to (p+1)/4 to take a square root.
// Field inversion does NOT go through here — it uses the packed 14-bit
// safegcd `fr_inv_by_loop_pk` in by_inverse_loop_pk14_native.
fn fr_pow(base: BigInt, exp: BigInt) -> BigInt {
    var result: BigInt = get_r();   // Montgomery 1
    var b: BigInt = base;

    for (var i = 0u; i < NUM_WORDS; i = i + 1u) {
        for (var j = 0u; j < WORD_SIZE; j = j + 1u) {
            if (((exp.limbs[i] >> j) & 1u) == 1u) {
                result = montgomery_product(&result, &b);
            }
            b = montgomery_product(&b, &b);
        }
    }
    return result;
}
