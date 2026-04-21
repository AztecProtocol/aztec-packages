// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/polynomials/univariate_coefficient_basis.hpp"

namespace bb {

/**
 * @brief Compute the 7 Lagrange evaluations of the Poseidon2 S-box applied to a degree-1 polynomial.
 *
 * Given a monomial-basis polynomial p(X) = a1 * X + a0 stored as a `UnivariateCoefficientBasis<FF, 2, *>`,
 * returns a `Univariate<FF, 7>` whose `i`-th entry is `p(i)^5` for i = 0, 1, ..., 6.
 *
 * The naive path ─ extrapolate p to 7 Lagrange points and then do `sqr; sqr; mul` elementwise ─ uses
 * 21 full field mults. This routine first expands `p^5` in the monomial basis:
 *
 *     p^5(X) = \sum_{i=0}^{5} C(5, i) * a1^i * a0^(5 - i) * X^i
 *
 * which needs exactly **12 full field mults** (the minimal addition-chain count for producing the six
 * bivariate monomials `a1^i * a0^(5-i)` for i = 0..5). The C(5, i) = (1, 5, 10, 10, 5, 1) binomial factors
 * are absorbed with a handful of additions (no full mults). The resulting degree-5 polynomial is then
 * evaluated at X = 0..6 by finite-difference forward propagation: because the 5th finite difference of a
 * degree-5 polynomial is constant (= 120 * a1^5), the 6 forward steps from X = 0 to X = 6 only require
 * additions. X = 0 and X = 1 come out "for free" (no shift-adds beyond the binomial absorbs).
 *
 * Overall cost: 12 full field mults + ~O(60) field additions, vs. 21 full field mults naively.
 * Net savings per S-box on BN254 ≈ 5 mult-equivalents (add is ~5 ns; field mult ~120 ns).
 */
/**
 * @brief Verifier-path overload: when the relation is instantiated against a plain field element
 * (`Accumulator = FF`, `CoefficientAccumulator = FF`), the S-box is just `x^5` at a single point.
 */
template <class FF> inline FF poseidon2_sbox_lagrange_7(const FF& x)
{
    FF x2 = x.sqr();
    FF x4 = x2.sqr();
    return x4 * x;
}

template <class FF, bool has_a0_plus_a1>
inline Univariate<FF, 7> poseidon2_sbox_lagrange_7(const UnivariateCoefficientBasis<FF, 2, has_a0_plus_a1>& p)
{
    const FF& a0 = p.coefficients[0]; // constant term: p(0) = a0
    const FF& a1 = p.coefficients[1]; // linear term

    // ─── Power ladders: a1^1..a1^5 and a0^1..a0^5 (8 mults) ──────────────────
    const FF a1_2 = a1.sqr();
    const FF a1_3 = a1_2 * a1;
    const FF a1_4 = a1_2.sqr();
    const FF a1_5 = a1_4 * a1;
    const FF a0_2 = a0.sqr();
    const FF a0_3 = a0_2 * a0;
    const FF a0_4 = a0_2.sqr();
    const FF a0_5 = a0_4 * a0;

    // ─── Mixed monomials (4 mults): total 12 full field mults so far ────────
    const FF M1 = a1 * a0_4;   // a1 * a0^4
    const FF M2 = a1_2 * a0_3; // a1^2 * a0^3
    const FF M3 = a1_3 * a0_2; // a1^3 * a0^2
    const FF M4 = a1_4 * a0;   // a1^4 * a0

    // ─── Absorb binomial coefficients C(5, i) = (1, 5, 10, 10, 5, 1) via shift-add ─
    // c_i = C(5, i) * M_i where M_0 = a0^5, M_5 = a1^5.
    // `*5` = (x+x)+(x+x)+x ; `*10` = 2 * `*5`.
    const FF c0 = a0_5;
    const FF M1_2 = M1 + M1;
    const FF M1_4 = M1_2 + M1_2;
    const FF c1 = M1_4 + M1; // 5 * M1
    const FF M2_2 = M2 + M2;
    const FF M2_4 = M2_2 + M2_2;
    const FF M2_5 = M2_4 + M2;
    const FF c2 = M2_5 + M2_5; // 10 * M2
    const FF M3_2 = M3 + M3;
    const FF M3_4 = M3_2 + M3_2;
    const FF M3_5 = M3_4 + M3;
    const FF c3 = M3_5 + M3_5; // 10 * M3
    const FF M4_2 = M4 + M4;
    const FF M4_4 = M4_2 + M4_2;
    const FF c4 = M4_4 + M4; // 5 * M4
    const FF c5 = a1_5;

    // ─── Extrapolate c_0 + c_1 X + ... + c_5 X^5 to X = 0..6 ──────────────────
    // Direct Horner at each integer point. For small constexpr k, `t * k` compiles to shift-adds.
    // We unroll rather than using a finite-difference column because the initial-column setup
    // (120 * c_5, 240 * c_5, ...) costs more shift-adds than the propagation saves at degree 5.
    Univariate<FF, 7> result;
    auto& ev = result.evaluations;

    ev[0] = c0;
    ev[1] = c0 + c1 + c2 + c3 + c4 + c5;

    // k = 2: Horner with `* 2` = doubling.
    {
        FF t = c5 + c5;
        t += c4;        // 2 c5 + c4
        t = t + t + c3; // 4 c5 + 2 c4 + c3
        t = t + t + c2;
        t = t + t + c1;
        t = t + t + c0;
        ev[2] = t;
    }
    // k = 3: `* 3` = (x + x) + x.
    {
        FF t2 = c5 + c5;
        FF t = t2 + c5 + c4; // 3 c5 + c4
        t2 = t + t;
        t = t2 + t + c3; // 3*prev + c3
        t2 = t + t;
        t = t2 + t + c2;
        t2 = t + t;
        t = t2 + t + c1;
        t2 = t + t;
        t = t2 + t + c0;
        ev[3] = t;
    }
    // k = 4: `* 4` = (x + x) + (x + x).
    {
        FF t = c5 + c5;
        t = t + t; // 4 c5
        t += c4;
        FF t2 = t + t;
        t = t2 + t2 + c3;
        t2 = t + t;
        t = t2 + t2 + c2;
        t2 = t + t;
        t = t2 + t2 + c1;
        t2 = t + t;
        t = t2 + t2 + c0;
        ev[4] = t;
    }
    // k = 5: `* 5` = (x + x + x + x) + x.
    {
        FF t2 = c5 + c5;
        FF t4 = t2 + t2;
        FF t = t4 + c5 + c4; // 5 c5 + c4
        t2 = t + t;
        t4 = t2 + t2;
        t = t4 + t + c3;
        t2 = t + t;
        t4 = t2 + t2;
        t = t4 + t + c2;
        t2 = t + t;
        t4 = t2 + t2;
        t = t4 + t + c1;
        t2 = t + t;
        t4 = t2 + t2;
        t = t4 + t + c0;
        ev[5] = t;
    }
    // k = 6: `* 6` = ((x + x) + x) + ((x + x) + x).
    {
        FF t2 = c5 + c5;
        FF t3 = t2 + c5;
        FF t = t3 + t3 + c4; // 6 c5 + c4
        t2 = t + t;
        t3 = t2 + t;
        t = t3 + t3 + c3;
        t2 = t + t;
        t3 = t2 + t;
        t = t3 + t3 + c2;
        t2 = t + t;
        t3 = t2 + t;
        t = t3 + t3 + c1;
        t2 = t + t;
        t3 = t2 + t;
        t = t3 + t3 + c0;
        ev[6] = t;
    }

    return result;
}

} // namespace bb
