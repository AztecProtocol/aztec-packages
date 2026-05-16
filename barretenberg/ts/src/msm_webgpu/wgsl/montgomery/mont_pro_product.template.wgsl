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
//
// Per outer iter:
//   t   = s[0] + xi*y[0]
//   qi  = (N0 * (t & MASK)) & MASK
//   c   = (t + qi*p[0]) >> WORD_SIZE
//   s[0] = s[1] + xi*y[1] + qi*p[1] + c
//   s[j-1] = s[j] + xi*y[j] + qi*p[j]   for j in [2, N-1]
//
// xi is hoisted to a `let` once per outer iter; the original code re-read
// `(*x).limbs[i]` from the pointer N+1 times per iter. The mitschabaude
// post-loop `s[N-2] = xi*y[N-1] + qi*p[N-1]` is dropped: the final inner
// iter (j=N-1) writes the same value because s[N-1] is never written and
// stays at zero throughout.
fn montgomery_product(x: ptr<function, BigInt>, y: ptr<function, BigInt>) -> BigInt {
    var s: BigInt;
    var p = get_p();

    for (var i = 0u; i < NUM_WORDS; i ++) {
        let xi: u32 = (*x).limbs[i];
        let t: u32 = s.limbs[0] + xi * (*y).limbs[0];
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * p.limbs[0]) >> WORD_SIZE;
        s.limbs[0] = s.limbs[1] + xi * (*y).limbs[1] + qi * p.limbs[1] + c;
        for (var j = 2u; j < NUM_WORDS; j ++) {
            s.limbs[j - 1u] = s.limbs[j] + xi * (*y).limbs[j] + qi * p.limbs[j];
        }
    }

    // Final carry pass — ensures every limb fits WORD_SIZE bits.
    var carry = 0u;
    for (var i = 0u; i < NUM_WORDS; i ++) {
        let v = s.limbs[i] + carry;
        carry = v >> WORD_SIZE;
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
