fn bigint_double(a: ptr<function, BigInt>, res: ptr<function, BigInt>) -> u32 {
    var carry: u32 = 0u;
    for (var j: u32 = 0u; j < NUM_WORDS; j ++) {
        let c: u32 = ((*a).limbs[j] * 2u) + carry;
        (*res).limbs[j] = c & MASK;
        carry = c >> WORD_SIZE;
    }
    return carry;
}

fn bigint_add(a: ptr<function, BigInt>, b: ptr<function, BigInt>, res: ptr<function, BigInt>) -> u32 {
    var carry: u32 = 0u;
    for (var j: u32 = 0u; j < NUM_WORDS; j ++) {
        let c: u32 = (*a).limbs[j] + (*b).limbs[j] + carry;
        (*res).limbs[j] = c & MASK;
        carry = c >> WORD_SIZE;
    }
    return carry;
}

fn bigint_sub(a: ptr<function, BigInt>, b: ptr<function, BigInt>, res: ptr<function, BigInt>) -> u32 {
    var borrow: u32 = 0u;
    for (var i: u32 = 0u; i < NUM_WORDS; i = i + 1u) {
        (*res).limbs[i] = (*a).limbs[i] - (*b).limbs[i] - borrow;
        if ((*a).limbs[i] < ((*b).limbs[i] + borrow)) {
            (*res).limbs[i] += TWO_POW_WORD_SIZE;
            borrow = 1u;
        } else {
            borrow = 0u;
        }
    }
    return borrow;
}

fn bigint_gt(x: ptr<function, BigInt>, y: ptr<function, BigInt>) -> u32 {
    for (var idx = 0u; idx < NUM_WORDS; idx ++) {
        var i = NUM_WORDS - 1u - idx;
        if ((*x).limbs[i] < (*y).limbs[i]) {
            return 0u;
        } else if ((*x).limbs[i] > (*y).limbs[i]) {
            return 1u;
        }
    }
    return 0u;
}

// Bit-exact equality on the limb representation. Note this is stricter than
// "value equivalence mod p": e.g. 0 and p are equivalent mod p but do NOT
// compare equal under this function. Callers that need value equivalence
// should compare inputs BEFORE subtraction (fr_sub can produce a limb-
// representation of p when the two inputs are equal mod p).
fn bigint_eq(x: ptr<function, BigInt>, y: ptr<function, BigInt>) -> bool {
    for (var i = 0u; i < NUM_WORDS; i ++) {
        if ((*x).limbs[i] != (*y).limbs[i]) {
            return false;
        }
    }
    return true;
}

fn bigint_is_even(x: ptr<function, BigInt>) -> bool {
    return ((*x).limbs[0] & 1u) == 0u;
}

fn bigint_is_one(x: ptr<function, BigInt>) -> bool {
    if ((*x).limbs[0] != 1u) {
        return false;
    }
    for (var i = 1u; i < NUM_WORDS; i ++) {
        if ((*x).limbs[i] != 0u) {
            return false;
        }
    }
    return true;
}

// In-place right shift by 1. The codebase invariant is that each limb is
// stored in [0, 2^WORD_SIZE), so the LSB of limb[i+1] becomes the MSB
// (bit WORD_SIZE-1) of new limb[i].
fn bigint_shr1(x: ptr<function, BigInt>) {
    let top_bit_pos: u32 = WORD_SIZE - 1u;
    for (var i = 0u; i < NUM_WORDS - 1u; i ++) {
        (*x).limbs[i] = ((*x).limbs[i] >> 1u) | (((*x).limbs[i + 1u] & 1u) << top_bit_pos);
    }
    (*x).limbs[NUM_WORDS - 1u] = (*x).limbs[NUM_WORDS - 1u] >> 1u;
}

fn bigint_gte(x: ptr<function, BigInt>, y: ptr<function, BigInt>) -> bool {
    for (var idx = 0u; idx < NUM_WORDS; idx ++) {
        let i = NUM_WORDS - 1u - idx;
        if ((*x).limbs[i] > (*y).limbs[i]) {
            return true;
        }
        if ((*x).limbs[i] < (*y).limbs[i]) {
            return false;
        }
    }
    return true;
}

// === Bounded variants used by fr_inv ===
//
// fr_inv tracks loose upper bounds `top_u`, `top_v` on the highest
// non-zero limb index of u and v. As the binary-GCD loop progresses both
// values shrink, so iterating only up to those bounds halves the per-op
// cost on u/v-side BigInts on average. The bound `top` is *inclusive*
// and must satisfy `(*x).limbs[i] == 0u` for all `i > top` (we tighten
// it with `bigint_recompute_top` after operations that can shrink the
// value). Bounds can be loose (an over-estimate is correctness-safe;
// just slower).

// Inclusive scan from `top` downward to find the highest non-zero limb.
// Returns 0 when x is zero (caller treats top=0 as "low limb only" and
// the algorithm's invariants make the all-zero case unreachable inside
// the loop — both u and v are 1 at termination, never 0).
fn bigint_recompute_top(x: ptr<function, BigInt>, top: u32) -> u32 {
    var t = top;
    loop {
        if (t == 0u) { break; }
        if ((*x).limbs[t] != 0u) { break; }
        t = t - 1u;
    }
    return t;
}

fn bigint_is_one_top(x: ptr<function, BigInt>, top: u32) -> bool {
    if ((*x).limbs[0] != 1u) { return false; }
    for (var i = 1u; i <= top; i ++) {
        if ((*x).limbs[i] != 0u) { return false; }
    }
    return true;
}

// In-place shift right by 1, only iterating up to `top`. Limbs above
// `top` are guaranteed zero, so the carry-from-above is also zero —
// no work needed up there.
fn bigint_shr1_top(x: ptr<function, BigInt>, top: u32) {
    let top_bit_pos: u32 = WORD_SIZE - 1u;
    for (var i = 0u; i < top; i ++) {
        (*x).limbs[i] = ((*x).limbs[i] >> 1u) | (((*x).limbs[i + 1u] & 1u) << top_bit_pos);
    }
    (*x).limbs[top] = (*x).limbs[top] >> 1u;
}

// In-place shift right by k bits where 0 < k < WORD_SIZE. Limbs above
// `top` stay at zero. Used for the CTZ-based bulk halving of u/v in the
// binary-GCD inner loop: after we observe the bottom `k` bits of the
// low limb are all zero, we can shift them all out in a single
// limb-pass instead of running k separate shr1 calls.
fn bigint_shr_k_in_word_top(x: ptr<function, BigInt>, k: u32, top: u32) {
    let bot_shift: u32 = WORD_SIZE - k;
    let lo_mask: u32 = (1u << k) - 1u;
    for (var i = 0u; i < top; i ++) {
        (*x).limbs[i] = ((*x).limbs[i] >> k) | (((*x).limbs[i + 1u] & lo_mask) << bot_shift);
    }
    (*x).limbs[top] = (*x).limbs[top] >> k;
}

fn bigint_gte_top(x: ptr<function, BigInt>, y: ptr<function, BigInt>, top: u32) -> bool {
    for (var idx = 0u; idx <= top; idx ++) {
        let i = top - idx;
        if ((*x).limbs[i] > (*y).limbs[i]) {
            return true;
        }
        if ((*x).limbs[i] < (*y).limbs[i]) {
            return false;
        }
    }
    return true;
}

// In-place subtract: x ← x - y, only iterating up to `top`. Caller
// guarantees x >= y (no underflow above `top`). Mirrors bigint_sub
// but writes back into x and skips the limbs that are known zero in
// both operands.
fn bigint_sub_top_inplace(x: ptr<function, BigInt>, y: ptr<function, BigInt>, top: u32) {
    var borrow: u32 = 0u;
    for (var i = 0u; i <= top; i = i + 1u) {
        let xi = (*x).limbs[i];
        let yi = (*y).limbs[i];
        var v: u32 = xi - yi - borrow;
        if (xi < yi + borrow) {
            v = v + TWO_POW_WORD_SIZE;
            borrow = 1u;
        } else {
            borrow = 0u;
        }
        (*x).limbs[i] = v;
    }
}

// Count trailing zero bits in the low limb only. The caller asserts
// `(*x).limbs[0] != 0u` (guaranteed in fr_inv: we only enter the inner
// halving loop when bigint_is_even(&x), and we exit immediately if the
// low limb hits 0 — at which point `bigint_shr_k_in_word_top` with
// k=WORD_SIZE-1 advances by one full limb and we re-enter). Returns
// at least 1 (since limbs[0] is even and non-zero) and at most
// WORD_SIZE-1 (the cap keeps the bulk shift inside a single limb).
fn bigint_ctz_lo_capped(x: ptr<function, BigInt>) -> u32 {
    let l0: u32 = (*x).limbs[0];
    if (l0 == 0u) {
        return WORD_SIZE - 1u;
    }
    var k: u32 = 0u;
    var v: u32 = l0;
    loop {
        if ((v & 1u) != 0u) { break; }
        if (k >= WORD_SIZE - 1u) { break; }
        k = k + 1u;
        v = v >> 1u;
    }
    return k;
}

// Halve x mod p by 2^k in one pass — replaces k separate iterations of
// "if x odd: x += p; x >>= 1" in the binary-GCD inner loop. Assumes
// 0 < k < WORD_SIZE and x in [0, p).
//
// Algebra: we want x' s.t. 2^k * x' ≡ x (mod p), x' in [0, p). Find
// the unique m in [0, 2^k) with (x + m·p) divisible by 2^k:
//
//   x + m·p ≡ 0 (mod 2^k)
//     ⇒ m ≡ -x · p^(-1) (mod 2^k)
//
// p is odd so p^(-1) mod 2^WORD_SIZE exists; we precompute it as the
// shader constant P_INV_MOD_2W. Then x' = (x + m·p) >> k. The result
// fits in NUM_WORDS limbs even though x + m·p can overflow them by up
// to k bits — we capture the overflow in a u32 carry and fold it into
// the high limb during the shift. (See the `carry << bot_shift` term
// at the end.)
fn bigint_halve_k_mod_p(x: ptr<function, BigInt>, p: ptr<function, BigInt>, k: u32) {
    let mask: u32 = (1u << k) - 1u;
    // m = -x.lo * p_inv (mod 2^k). Use ((mask + 1u - lo) & mask) for the
    // negation: equivalent to (-lo) & mask without relying on i32 / wrap.
    let neg_lo: u32 = ((mask + 1u) - ((*x).limbs[0] & mask)) & mask;
    let m: u32 = (neg_lo * P_INV_MOD_2W) & mask;

    // Accumulate x ← x + m·p, limb-by-limb, with carry into a phantom
    // limb above NUM_WORDS-1. Each limb sum is bounded by:
    //   limbs[i] (< 2^WORD_SIZE) + m·p_i (< 2^(2·WORD_SIZE)) + carry_in
    // For WORD_SIZE = 13 and worst-case carry growth ~ 2^WORD_SIZE per
    // step, the accumulator stays under 2^(2·WORD_SIZE + 1) ≪ 2^32.
    var carry: u32 = 0u;
    for (var i = 0u; i < NUM_WORDS; i = i + 1u) {
        let v: u32 = (*x).limbs[i] + (*p).limbs[i] * m + carry;
        (*x).limbs[i] = v & MASK;
        carry = v >> WORD_SIZE;
    }
    // Right-shift the (NUM_WORDS-limb) result + the phantom-limb carry
    // by k bits in one pass. The phantom-limb's low k bits feed into
    // the new high limb's top k bits.
    let bot_shift: u32 = WORD_SIZE - k;
    let lo_mask: u32 = (1u << k) - 1u;
    for (var i = 0u; i < NUM_WORDS - 1u; i ++) {
        (*x).limbs[i] = ((*x).limbs[i] >> k) | (((*x).limbs[i + 1u] & lo_mask) << bot_shift);
    }
    (*x).limbs[NUM_WORDS - 1u] = ((*x).limbs[NUM_WORDS - 1u] >> k) | ((carry & lo_mask) << bot_shift);
}

// === 2's complement signed helpers (used by safegcd fr_inv) ===
//
// We treat BigInt as a signed integer in two's complement on
// NUM_WORDS · WORD_SIZE bits (BN254: 20 · 13 = 260 bits). The sign
// bit is bit (WORD_SIZE-1) of the topmost limb. Operands are in
// [-2^(W-1), 2^(W-1)) where W = NUM_WORDS·WORD_SIZE = 260.
//
// Bernstein-Yang's invariant guarantees |f|, |g| ≤ p < 2^254 throughout
// the safegcd loop, so the 6-bit sign-headroom (260 - 254) is plenty
// — no overflow into the sign bit during add/sub.

// True iff x's top bit is set (negative under 2's complement).
fn bigint_is_neg_2c(x: ptr<function, BigInt>) -> bool {
    return (((*x).limbs[NUM_WORDS - 1u] >> (WORD_SIZE - 1u)) & 1u) == 1u;
}

// Bit-exact zero check (zero is unique under 2's complement).
fn bigint_is_zero(x: ptr<function, BigInt>) -> bool {
    for (var i = 0u; i < NUM_WORDS; i = i + 1u) {
        if ((*x).limbs[i] != 0u) {
            return false;
        }
    }
    return true;
}

// 2's complement add. Wraps modulo 2^(NUM_WORDS·WORD_SIZE); the carry-
// out is discarded. Sign emerges from the bit pattern of the top limb.
fn bigint_add_2c(a: ptr<function, BigInt>, b: ptr<function, BigInt>, out: ptr<function, BigInt>) {
    var carry: u32 = 0u;
    for (var i = 0u; i < NUM_WORDS; i = i + 1u) {
        let v: u32 = (*a).limbs[i] + (*b).limbs[i] + carry;
        (*out).limbs[i] = v & MASK;
        carry = v >> WORD_SIZE;
    }
}

// 2's complement subtract: out ← a - b, computed as a + (~b + 1).
// `~b` is the per-limb bitwise NOT masked to WORD_SIZE bits, which is
// the limb-wise representation of the 2's complement negation of b
// before adding 1.
fn bigint_sub_2c(a: ptr<function, BigInt>, b: ptr<function, BigInt>, out: ptr<function, BigInt>) {
    var carry: u32 = 1u;
    for (var i = 0u; i < NUM_WORDS; i = i + 1u) {
        let neg_b: u32 = (~(*b).limbs[i]) & MASK;
        let v: u32 = (*a).limbs[i] + neg_b + carry;
        (*out).limbs[i] = v & MASK;
        carry = v >> WORD_SIZE;
    }
}

// In-place arithmetic shift right by 1 (sign-preserving). For an EVEN
// value, equivalent to exact integer division by 2. The safegcd algorithm
// only invokes this on values it has just guaranteed to be even (g - f
// when both g and f are odd, or g when g_low = 0), so the no-rounding
// guarantee holds.
fn bigint_arith_shr1(x: ptr<function, BigInt>) {
    let top_bit_pos: u32 = WORD_SIZE - 1u;
    let sign_bit: u32 = ((*x).limbs[NUM_WORDS - 1u] >> top_bit_pos) & 1u;
    for (var i = 0u; i < NUM_WORDS - 1u; i = i + 1u) {
        (*x).limbs[i] = ((*x).limbs[i] >> 1u) | (((*x).limbs[i + 1u] & 1u) << top_bit_pos);
    }
    (*x).limbs[NUM_WORDS - 1u] = ((*x).limbs[NUM_WORDS - 1u] >> 1u) | (sign_bit << top_bit_pos);
}

// === Jumpy safegcd helpers (Pornin) ===
//
// These helpers support the K=12 jumpy safegcd implementation in
// fr_pow.template.wgsl. Each outer iteration of the algorithm runs K
// inner divsteps on the LOW WORD_SIZE bits of f, g (cheap; just i32
// ops), accumulates a 2x2 transformation matrix with entries bounded
// by 2^K, then applies that matrix to the full 260-bit f, g, u, v via
// the helpers below.
//
// The matrix entries are signed integers in [-2^K, 2^K]. For K=12 they
// fit in i16; we use i32 for arithmetic headroom.

// Sign-extend a WORD_SIZE-bit limb (bit (WORD_SIZE-1) is sign) to i32.
// Used to read the topmost limb of a signed BigInt for multi-limb
// signed multiplication.
fn bigint_sign_extend_limb(x: u32) -> i32 {
    let shift_u: u32 = 32u - WORD_SIZE;
    return (i32(x) << shift_u) >> shift_u;
}

// out = (a * x + b * y) >> k, signed.
//
// a, b: 2's complement signed BigInts on NUM_WORDS·WORD_SIZE bits.
// x, y: signed i32 with |x|, |y| <= 2^K (K = 12 for jumpy fr_inv).
// k:    right-shift amount, 0 < k < WORD_SIZE.
// out:  signed result, fits in NUM_WORDS·WORD_SIZE bits (algorithm
//       invariant — Bernstein-Yang guarantees |new_f|, |new_g| <= p < 2^254
//       after each outer iter).
//
// Implementation: accumulate a*x + b*y limb-by-limb into a phantom
// (NUM_WORDS+1)-limb signed buffer (the top "phantom limb" tracked as
// an i32 carry), then arithmetic shift right by k with sign propagation.
//
// Bound check (K=12, WORD_SIZE=13): per-limb product magnitude
// 2^13 · 2^12 = 2^25; sum of two products + carry ≤ 2^26 + 2^13 < 2^27 —
// fits comfortably in i32.
fn bigint_signed_axby_shr_k(
    a: ptr<function, BigInt>, x: i32,
    b: ptr<function, BigInt>, y: i32,
    k: u32,
    out: ptr<function, BigInt>,
) {
    var acc: array<u32, NUM_WORDS>;
    var carry: i32 = 0i;

    // Limbs 0..NUM_WORDS-2: unsigned 13-bit values, cast to i32 stays
    // positive. No sign-extension needed.
    for (var i: u32 = 0u; i < NUM_WORDS - 1u; i = i + 1u) {
        let a_limb: i32 = i32((*a).limbs[i]);
        let b_limb: i32 = i32((*b).limbs[i]);
        let prod: i32 = a_limb * x + b_limb * y + carry;
        acc[i] = u32(prod) & MASK;
        carry = prod >> WORD_SIZE;  // i32 >> = arithmetic shift
    }

    // Top limb (index NUM_WORDS-1): bit (WORD_SIZE-1) is the sign bit
    // of the full 260-bit a / b. Sign-extend to i32 before multiplying.
    let a_top: i32 = bigint_sign_extend_limb((*a).limbs[NUM_WORDS - 1u]);
    let b_top: i32 = bigint_sign_extend_limb((*b).limbs[NUM_WORDS - 1u]);
    let top_prod: i32 = a_top * x + b_top * y + carry;
    acc[NUM_WORDS - 1u] = u32(top_prod) & MASK;
    carry = top_prod >> WORD_SIZE;

    // Right-shift the 21-limb signed value (acc[0..19] + `carry` as
    // phantom limb 20) by k, with sign-extension into the new top limb.
    let bot_shift: u32 = WORD_SIZE - k;
    let lo_mask: u32 = (1u << k) - 1u;
    for (var i: u32 = 0u; i < NUM_WORDS - 1u; i = i + 1u) {
        (*out).limbs[i] = (acc[i] >> k) | ((acc[i + 1u] & lo_mask) << bot_shift);
    }
    // For the new top limb, the high k bits come from the low k bits of
    // `carry`. carry is i32; u32(carry) gives 2's complement bit pattern
    // (same low bits for both signs), so the masked low k bits feed
    // correctly into the result's sign region.
    (*out).limbs[NUM_WORDS - 1u] = (acc[NUM_WORDS - 1u] >> k) | ((u32(carry) & lo_mask) << bot_shift);
}

// out = halve_mod_p((a * x + b * y), k) — equivalent to
// (a · x + b · y) · 2^(-k) mod p, returned in canonical [0, p).
//
// a, b: in [0, p), canonical (positive, so their top limb's bit
//       (WORD_SIZE-1) is 0 since p < 2^254 < 2^(NUM_WORDS·WORD_SIZE - 6)).
// x, y: signed i32, |x|, |y| <= 2^K.
// p:    modulus, in canonical form.
// k:    halving exponent, 0 < k < WORD_SIZE.
// out:  result in [0, p).
//
// Algorithm (generalized m-trick):
//   1. Compute z = a · x + b · y as a 21-limb signed extended integer.
//   2. Find m in [0, 2^k) with z + m·p ≡ 0 (mod 2^k):
//        m ≡ -z · p^(-1) (mod 2^k)
//      (low k bits of z suffice to compute m, since p^(-1) is precomputed
//      as P_INV_MOD_2W).
//   3. Add m·p to z (now divisible by 2^k).
//   4. Arithmetic shift right by k.
//   5. Normalize to [0, p) via conditional ±p additions/subtractions.
//      Result before normalization is in [-3p, 3p] (worst case from
//      magnitude bounds: |z| < 2 · p · 2^K, |m·p| < p · 2^K, sum < 3·p·2^K;
//      /2^K gives < 3p).
fn bigint_signed_axby_modp_halve_k(
    a: ptr<function, BigInt>, x: i32,
    b: ptr<function, BigInt>, y: i32,
    p: ptr<function, BigInt>,
    k: u32,
    out: ptr<function, BigInt>,
) {
    // Step 1: z = a·x + b·y as 21-limb signed extended.
    var acc: array<u32, NUM_WORDS>;
    var carry: i32 = 0i;
    for (var i: u32 = 0u; i < NUM_WORDS - 1u; i = i + 1u) {
        let a_limb: i32 = i32((*a).limbs[i]);
        let b_limb: i32 = i32((*b).limbs[i]);
        let prod: i32 = a_limb * x + b_limb * y + carry;
        acc[i] = u32(prod) & MASK;
        carry = prod >> WORD_SIZE;
    }
    // a, b are in [0, p) so their top limbs are positive (sign bit 0);
    // i32 cast gives positive value. Still call sign_extend_limb for
    // uniformity (it's a no-op when bit (WORD_SIZE-1) is clear).
    let a_top: i32 = bigint_sign_extend_limb((*a).limbs[NUM_WORDS - 1u]);
    let b_top: i32 = bigint_sign_extend_limb((*b).limbs[NUM_WORDS - 1u]);
    let top_prod: i32 = a_top * x + b_top * y + carry;
    acc[NUM_WORDS - 1u] = u32(top_prod) & MASK;
    carry = top_prod >> WORD_SIZE;

    // Step 2: m-trick. m ≡ -(low k bits of z) · p^(-1) (mod 2^k).
    let mask: u32 = (1u << k) - 1u;
    let lo_k: u32 = acc[0] & mask;
    let neg_lo: u32 = ((mask + 1u) - lo_k) & mask;
    let m: u32 = (neg_lo * P_INV_MOD_2W) & mask;

    // Step 3: add m·p to acc limb-by-limb. m·p has at most NUM_WORDS
    // limbs (m < 2^k < 2^WORD_SIZE), so we iterate NUM_WORDS times and
    // capture the overflow in `mp_carry`.
    var mp_carry: u32 = 0u;
    for (var i: u32 = 0u; i < NUM_WORDS; i = i + 1u) {
        let v: u32 = acc[i] + (*p).limbs[i] * m + mp_carry;
        acc[i] = v & MASK;
        mp_carry = v >> WORD_SIZE;
    }
    // mp_carry is u32 (always non-negative); add to signed `carry`.
    let new_carry: i32 = carry + i32(mp_carry);

    // Step 4: arith shift right by k. Result has NUM_WORDS limbs of
    // WORD_SIZE bits each, with sign coming from the low k bits of
    // `new_carry`.
    let bot_shift: u32 = WORD_SIZE - k;
    let lo_mask: u32 = (1u << k) - 1u;
    for (var i: u32 = 0u; i < NUM_WORDS - 1u; i = i + 1u) {
        (*out).limbs[i] = (acc[i] >> k) | ((acc[i + 1u] & lo_mask) << bot_shift);
    }
    (*out).limbs[NUM_WORDS - 1u] = (acc[NUM_WORDS - 1u] >> k) | ((u32(new_carry) & lo_mask) << bot_shift);

    // Step 5: normalize to [0, p). The pre-normalize value is in [-3p, 3p]
    // (see bound analysis in header), so up to 3 +p / 3 -p operations
    // suffice. We loop up to 4 times each direction for safety; the
    // `break` exits as soon as the value lands in [0, p).
    for (var i: u32 = 0u; i < 4u; i = i + 1u) {
        if (bigint_is_neg_2c(out)) {
            var tmp: BigInt;
            let _c = bigint_add(out, p, &tmp);
            *out = tmp;
        } else {
            break;
        }
    }
    for (var i: u32 = 0u; i < 4u; i = i + 1u) {
        if (bigint_gte(out, p)) {
            var tmp: BigInt;
            let _b = bigint_sub(out, p, &tmp);
            *out = tmp;
        } else {
            break;
        }
    }
}
