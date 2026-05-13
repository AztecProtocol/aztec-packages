const NUM_WORDS = {{ num_words }}u;
const WORD_SIZE = {{ word_size }}u;
const MASK = {{ mask }}u;
const TWO_POW_WORD_SIZE = {{ two_pow_word_size }}u;
const N0 = {{ n0 }}u;
// p^(-1) mod 2^WORD_SIZE. Used by `bigint_halve_k_mod_p` (the m-trick
// in fr_inv's CTZ-bulk halving): given x in [0, p), find m in [0, 2^k)
// such that x + m·p ≡ 0 (mod 2^k), then x' = (x + m·p) >> k. Solving
// for m: m ≡ -x · p^(-1) (mod 2^k). Since p is odd, p^(-1) mod 2^k
// exists and equals (p^(-1) mod 2^WORD_SIZE) & ((1<<k)-1) for any k
// ≤ WORD_SIZE.
const P_INV_MOD_2W = {{ p_inv_mod_2w }}u;

fn get_p() -> BigInt {
    var p: BigInt;
{{{ p_limbs }}}
    return p;
}

// An optimised variant of the Montgomery product algorithm from
// https://github.com/mitschabaude/montgomery#13-x-30-bit-multiplication
fn montgomery_product(x: ptr<function, BigInt>, y: ptr<function, BigInt>) -> BigInt {
    var s: BigInt;
    var p = get_p();

    for (var i = 0u; i < NUM_WORDS; i ++) {
        var t = s.limbs[0] + (*x).limbs[i] * (*y).limbs[0];

        var tprime = t & MASK;

        var qi = (N0 * tprime) & MASK;

        var c = (t + qi * p.limbs[0]) >> WORD_SIZE;

        s.limbs[0] = s.limbs[1] + (*x).limbs[i] * (*y).limbs[1] + qi * p.limbs[1] + c;

        // Since nSafe = 32 when NUM_WORDS = 20, we can perform the following
        // iterations without performing a carry.
        for (var j = 2u; j < NUM_WORDS; j ++) {
            s.limbs[j - 1u] = s.limbs[j] + (*x).limbs[i] * (*y).limbs[j] + qi * p.limbs[j];
        }

        s.limbs[NUM_WORDS - 2u] = (*x).limbs[i] * (*y).limbs[NUM_WORDS - 1u] + qi * p.limbs[NUM_WORDS - 1u];
    }

    // To paraphrase mitschabaude: a last round of carries to ensure that each
    // limb is at most WORD_SIZE bits
    var c = 0u;
    for (var i = 0u; i < NUM_WORDS; i ++) {
        var v = s.limbs[i] + c;
        c = v >> WORD_SIZE;
        s.limbs[i] = v & MASK;
    }

    return conditional_reduce(&s, &p);
}

fn conditional_reduce(x: ptr<function, BigInt>, y: ptr<function, BigInt>) -> BigInt {
    // Reduce when x >= y, not just x > y. The equality case matters: if x is
    // a limb-wise copy of p (value-0 mod p but non-canonical), is_zero() would
    // return false downstream, and that breaks identity checks in the EC
    // shaders. Reducing on == ensures the output is always canonical in
    // [0, p).
    var x_gt_y = bigint_gt(x, y);
    var x_eq_y = bigint_eq(x, y);

    if (x_gt_y == 1u || x_eq_y) {
        var res: BigInt;
        bigint_sub(x, y, &res);
        return res;
    }

    return *x;
}
