// Field exponentiation and inversion.
//
// Inputs/outputs are in Montgomery form. The Montgomery representative
// of 1 is R itself (since x*R mod p stores the integer x; 1*R = R), so
// `get_r()` is the multiplicative identity here.
//
// `fr_inv` is the hot fr operation in the batch-affine pipeline — it's
// the single sequential dependency at the centre of every batch_inverse
// dispatch (one call on tid=0 per workgroup, with the other 63 threads
// blocked at workgroupBarrier waiting). For BN254 with the previous
// Fermat / square-and-multiply implementation this was ~514 montgomery
// products per call, dominating mid-to-late round costs once N drops
// below ~1K. The binary extended GCD path below replaces it with ~256
// outer iterations of cheap BigInt shift / add / sub, plus ONE final
// montgomery_product to convert the native-form result back into
// Montgomery form. About 5-8× faster on the serial path.

// Generic Montgomery-form exponentiation, kept as a fallback / utility.
// Square-and-multiply over the limb-level bits of `exp`. Used by tests
// (the fr_pow / fr_inv Jest transcription) but no longer the primary
// fr_inv backbone.
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

// The Fermat inverse (fr_pow_inv = a^(p-2), ~381 montgomery_products per call)
// has been removed: field inversion goes exclusively through the safegcd path
// (fr_inv_by_loop_pk in by_inverse_loop), which is hundreds× cheaper and
// representation-independent. `fr_pow` above is retained only for the
// decompress square-root.

// R^3 mod p. Used by `fr_inv` to convert the binary-GCD output (which is
// in native form, pre-multiplied by R^(-1) because the input was in
// Montgomery form) back into Montgomery form via a single
// montgomery_product. See the derivation in the fr_inv body.
fn get_r_cubed() -> BigInt {
    var r3: BigInt;
{{{ r_cubed_limbs }}}
    return r3;
}

// Field inversion via Pornin's jumpy safegcd (Bernstein-Yang with K-step
// inner divsteps). https://eprint.iacr.org/2020/972
//
// Input `a` is in Montgomery form (encoding integer A = a · R mod p).
// Output is Montgomery form mont(a^(-1)) = a^(-1) · R mod p.
//
// === Algorithm overview ===
//
// State: (f, g, u, v, delta) where
//   - f, g: 2's complement signed BigInts on NUM_WORDS·WORD_SIZE = 260
//     bits. f starts as p, g as A. Bernstein-Yang invariant guarantees
//     |f|, |g| ≤ p < 2^254 throughout (6 spare bits including sign).
//   - u, v: in [0, p), canonical. Track M[0][1] mod p and M[1][1] mod p
//     of the cumulative transformation matrix.
//   - delta: signed i32 driving the step choice.
//
// Each OUTER iteration:
//   1. Extract the low WORD_SIZE bits of f, g into i32 approximations
//      (f_inner, g_inner). Run K=12 INNER divsteps on these — cheap
//      i32 operations — while accumulating an unscaled integer matrix
//      [[u00, u01], [u10, u11]] with entries bounded by 2^K. The
//      divstep CHOICES only depend on (delta, g & 1), and the low K+1
//      bits of g preserve g's low-bit evolution through K steps, so
//      the matrix from the inner loop equals what plain safegcd would
//      have built over K steps.
//
//   2. Apply the matrix to full (f, g) via signed multi-limb mul + arith
//      shift right by K (`bigint_signed_axby_shr_k`):
//        new_f = (u00 · f + u01 · g) >> K
//        new_g = (u10 · f + u11 · g) >> K
//      Divisibility by 2^K is guaranteed by the algorithm; the shift
//      is exact.
//
//   3. Apply the matrix mod p to (u, v) via the generalized m-trick
//      (`bigint_signed_axby_modp_halve_k`):
//        new_u = halve_mod_p((u00 · u + u01 · v), K)
//        new_v = halve_mod_p((u10 · u + u11 · v), K)
//
// === Iteration count ===
//
// Pornin's Theorem 11.2 bound: ⌈(49n + 80) / (17 · K)⌉ outer iterations
// suffice for n-bit inputs. For BN254 (n=254), K=12: ⌈61.4⌉ = 62. Cap
// at 70 for safety.
//
// === Why K=12 ===
//
//   - The approximation needs K+1 = 13 bits of low-bit fidelity, which
//     is exactly one WORD_SIZE limb (limbs[0]).
//   - Matrix entries bounded by 2^K = 4096 fit in i16, with i32 used
//     for arithmetic headroom (subtractions can briefly hit 2^(K+1)).
//   - Per-limb products in the matrix application: limb (2^13) ·
//     matrix_entry (2^12) = 2^25; sum of 2 + carry ≤ 2^27, fits in i32.
//   - `bigint_halve_k_mod_p`'s K < WORD_SIZE precondition is satisfied.
//
// === Comparison to plain safegcd (the previous fr_inv) ===
//
// Plain safegcd: ~737 outer iter × ~4 BigInt-equivalent ops/iter.
// Jumpy K=12:    ~62 outer iter × ~10 BigInt-equivalent ops/iter
//                                  (4 muls + accumulate + shift + mod-p
//                                  normalisation), plus ~120 cheap i32
//                                  ops for the inner loop.
//
// Estimated speedup on the critical path: ~2-3× vs plain safegcd in
// total BigInt-op count, depending on how the GPU pipelines the inner
// loop and the multi-limb axby calls.
//
// The previous plain safegcd is kept available as `fr_inv_plain` for
// A/B comparison; the previous binary-GCD-with-T1.b/c is `fr_inv_bgcd`.
fn fr_inv(a: BigInt) -> BigInt {
    const JUMPY_K: u32 = 12u;
    const JUMPY_MAX_OUTER: u32 = 70u;

    var f: BigInt = get_p();
    var g: BigInt = a;
    var u: BigInt;             // 0 (default-init)
    var v: BigInt;
    v.limbs[0] = 1u;           // 1
    var delta: i32 = 1;

    var p_const: BigInt = get_p();

    var found = false;
    for (var outer_iter: u32 = 0u; outer_iter < JUMPY_MAX_OUTER; outer_iter = outer_iter + 1u) {
        if (bigint_is_zero(&g)) {
            found = true;
            break;
        }

        // Inner loop: K divsteps on (f.limbs[0], g.limbs[0]) treated as
        // i32 approximations. Builds the unscaled 2x2 matrix.
        var u00: i32 = 1i; var u01: i32 = 0i;
        var u10: i32 = 0i; var u11: i32 = 1i;
        var f_inner: i32 = i32(f.limbs[0]);
        var g_inner: i32 = i32(g.limbs[0]);
        var inner_delta: i32 = delta;
        for (var i: u32 = 0u; i < JUMPY_K; i = i + 1u) {
            let g_low: i32 = g_inner & 1i;
            let take_swap: bool = (inner_delta > 0i) && (g_low == 1i);
            if (take_swap) {
                // M_step_unscaled = [[0, 2], [-1, 1]]
                let new_u00: i32 = u10 * 2i;
                let new_u01: i32 = u11 * 2i;
                let new_u10: i32 = u10 - u00;
                let new_u11: i32 = u11 - u01;
                u00 = new_u00; u01 = new_u01;
                u10 = new_u10; u11 = new_u11;

                let new_f: i32 = g_inner;
                g_inner = g_inner - f_inner;
                f_inner = new_f;
                inner_delta = 1i - inner_delta;
            } else if (g_low == 1i) {
                // M_step_unscaled = [[2, 0], [1, 1]]; top row doubles,
                // bottom row gets +(top row).
                u10 = u00 + u10;
                u11 = u01 + u11;
                u00 = u00 * 2i;
                u01 = u01 * 2i;
                g_inner = g_inner + f_inner;
                inner_delta = inner_delta + 1i;
            } else {
                // M_step_unscaled = [[2, 0], [0, 1]]; only top row doubles.
                u00 = u00 * 2i;
                u01 = u01 * 2i;
                inner_delta = inner_delta + 1i;
            }
            // Halve g_inner (arith shr 1).
            g_inner = g_inner >> 1u;
        }
        delta = inner_delta;

        // Apply matrix to (f, g): full multi-limb signed mul + arith shr K.
        var new_f: BigInt;
        var new_g: BigInt;
        bigint_signed_axby_shr_k(&f, u00, &g, u01, JUMPY_K, &new_f);
        bigint_signed_axby_shr_k(&f, u10, &g, u11, JUMPY_K, &new_g);
        f = new_f;
        g = new_g;

        // Apply matrix mod p to (u, v): m-trick generalized for ax + by.
        var new_u: BigInt;
        var new_v: BigInt;
        bigint_signed_axby_modp_halve_k(&u, u00, &v, u01, &p_const, JUMPY_K, &new_u);
        bigint_signed_axby_modp_halve_k(&u, u10, &v, u11, &p_const, JUMPY_K, &new_v);
        u = new_u;
        v = new_v;
    }

    // Defensive: if `a` was 0 (or didn't converge), return 0.
    if (!found) {
        var zero: BigInt;
        return zero;
    }

    // a^(-1) ≡ sign(f) · u (mod p). If f is negative, negate u mod p.
    var inv_native: BigInt = u;
    if (bigint_is_neg_2c(&f)) {
        var negated: BigInt;
        let _b = bigint_sub(&p_const, &u, &negated);
        inv_native = negated;
    }

    // Convert native → Montgomery: mont_product(inv_native, R^3).
    var r_cubed: BigInt = get_r_cubed();
    return montgomery_product(&inv_native, &r_cubed);
}

// Plain safegcd (1 divstep per iteration). Kept for A/B comparison
// against the jumpy `fr_inv` above. Not called by production.
fn fr_inv_plain(a: BigInt) -> BigInt {
    var f: BigInt = get_p();
    var g: BigInt = a;
    var v: BigInt;             // 0 (default-init)
    var r: BigInt;
    r.limbs[0] = 1u;           // 1
    var delta: i32 = 1;

    var p_const: BigInt = get_p();

    var found = false;
    for (var iter: u32 = 0u; iter < 750u; iter = iter + 1u) {
        if (bigint_is_zero(&g)) {
            found = true;
            break;
        }

        let g_low: u32 = g.limbs[0] & 1u;
        let take_swap: bool = (delta > 0) && (g_low == 1u);

        if (take_swap) {
            var diff: BigInt;
            bigint_sub_2c(&g, &f, &diff);
            bigint_arith_shr1(&diff);
            var saved_g: BigInt = g;
            f = saved_g;
            g = diff;
            delta = 1 - delta;

            var rv_diff: BigInt = fr_sub(&r, &v);
            bigint_halve_k_mod_p(&rv_diff, &p_const, 1u);
            v = r;
            r = rv_diff;
        } else if (g_low == 1u) {
            var sum: BigInt;
            bigint_add_2c(&g, &f, &sum);
            bigint_arith_shr1(&sum);
            g = sum;
            delta = delta + 1;

            var rv_sum: BigInt = fr_add(&r, &v);
            bigint_halve_k_mod_p(&rv_sum, &p_const, 1u);
            r = rv_sum;
        } else {
            bigint_arith_shr1(&g);
            delta = delta + 1;
            bigint_halve_k_mod_p(&r, &p_const, 1u);
        }
    }

    if (!found) {
        var zero: BigInt;
        return zero;
    }

    var inv_native: BigInt = v;
    if (bigint_is_neg_2c(&f)) {
        var negated: BigInt;
        let _b = bigint_sub(&p_const, &v, &negated);
        inv_native = negated;
    }

    var r_cubed: BigInt = get_r_cubed();
    return montgomery_product(&inv_native, &r_cubed);
}

// Legacy binary-extended-GCD fr_inv. Kept available for A/B comparison
// against the safegcd path above. Not called by the production kernel
// — the dispatcher picks `fr_inv` (safegcd). To swap back, rename
// `fr_inv_bgcd` here to `fr_inv` and rename the safegcd version above
// to something else.
//
// Two perf optimisations on top of the textbook formulation:
//
//   * CTZ-bulk halving (T1.b). The textbook "while u even: shr1" inner
//     loop iterates one bit at a time; instead we read the trailing-zero
//     count of u's low limb and shift by that many bits in one limb-pass.
//     For x1 we use the m-trick `bigint_halve_k_mod_p`: the unique
//     m ∈ [0, 2^k) with (x1 + m·p) ≡ 0 (mod 2^k) lets us perform k
//     halvings as one BigInt-add and one shr-by-k. Average ~2× speedup
//     on the inner halving block (random binary GCD has E[ctz] ≈ 2).
//
//   * Limb-bound tracking (T1.c). We keep `top_u`, `top_v` as loose
//     upper bounds on the highest non-zero limb of u and v. Both shrink
//     monotonically as the algorithm progresses; using the bounded
//     `_top` variants of shr1 / is_one / gte / sub halves the per-op
//     cost on average across the ~250 outer iterations it takes for
//     254-bit inputs to converge.
fn fr_inv_bgcd(a: BigInt) -> BigInt {
    var u: BigInt = a;
    var v: BigInt = get_p();

    var x1: BigInt;             // x1 = 1
    x1.limbs[0] = 1u;
    var x2: BigInt;             // x2 = 0  (default-initialized)

    var p_const: BigInt = get_p();

    // Loose upper bounds on the topmost non-zero limb of u and v. p
    // uses limb (NUM_WORDS - 1) (BN254: bit 254 fits in limb 19), and
    // a < p so u also fits there at start. Both shrink monotonically;
    // we tighten with `bigint_recompute_top` after every shift /
    // subtraction. x1 / x2 stay in [0, p) throughout, so they don't
    // benefit from limb-bound tracking.
    var top_u: u32 = NUM_WORDS - 1u;
    var top_v: u32 = NUM_WORDS - 1u;

    var inv_native: BigInt;
    var found = false;
    for (var iter: u32 = 0u; iter < 1024u; iter = iter + 1u) {
        if (bigint_is_one_top(&u, top_u)) {
            inv_native = x1;
            found = true;
            break;
        }
        if (bigint_is_one_top(&v, top_v)) {
            inv_native = x2;
            found = true;
            break;
        }

        // Halve u while it's even, applying matched halvings to x1 mod p
        // so the invariant A * x1 ≡ u (mod p) is maintained. The
        // `bigint_ctz_lo_capped` returns 1..WORD_SIZE-1 trailing zeros
        // of the low limb; if the low limb itself is zero (we've cleared
        // a full word of trailing zeros) it returns WORD_SIZE-1, so the
        // bulk shift always makes progress and we re-enter the loop to
        // strip more.
        loop {
            if (!bigint_is_even(&u)) { break; }
            let k = bigint_ctz_lo_capped(&u);
            bigint_shr_k_in_word_top(&u, k, top_u);
            top_u = bigint_recompute_top(&u, top_u);
            bigint_halve_k_mod_p(&x1, &p_const, k);
        }

        // Same for v / x2.
        loop {
            if (!bigint_is_even(&v)) { break; }
            let k = bigint_ctz_lo_capped(&v);
            bigint_shr_k_in_word_top(&v, k, top_v);
            top_v = bigint_recompute_top(&v, top_v);
            bigint_halve_k_mod_p(&x2, &p_const, k);
        }

        // Both u and v are now odd. Subtract the smaller from the
        // larger; mirror the subtraction on the x1/x2 coefficients
        // mod p (fr_sub returns canonical [0, p)). The cost-bounding
        // top is the larger of the two — at most one of u, v can be
        // > the other so iterating up to max(top_u, top_v) is tight.
        let top_uv: u32 = max(top_u, top_v);
        if (bigint_gte_top(&u, &v, top_uv)) {
            bigint_sub_top_inplace(&u, &v, top_uv);
            top_u = bigint_recompute_top(&u, top_u);
            x1 = fr_sub(&x1, &x2);
        } else {
            bigint_sub_top_inplace(&v, &u, top_uv);
            top_v = bigint_recompute_top(&v, top_v);
            x2 = fr_sub(&x2, &x1);
        }
    }

    // Defensive: if `a` was 0 the algorithm would not converge — return
    // 0 in that case (and any caller passing a zero delta is already
    // buggy upstream; the schedule kernel filters delta == 0).
    if (!found) {
        var zero: BigInt;
        return zero;
    }

    // inv_native = a^(-1) * R^(-1) mod p (in [0, p)).
    // Multiply by R^3 in Montgomery domain to land back in Montgomery
    // form: see derivation in the function header.
    var r_cubed: BigInt = get_r_cubed();
    return montgomery_product(&inv_native, &r_cubed);
}
