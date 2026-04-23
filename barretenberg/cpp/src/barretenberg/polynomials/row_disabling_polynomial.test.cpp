// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/polynomials/row_disabling_polynomial.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <gtest/gtest.h>

using namespace bb;

using FF = fr;

TEST(RowDisablingPolynomial, LDualEvalsComplementOneMinusL)
{
    RowDisablingPolynomial<FF> rd;
    // Initial state: (1 - L) is the constant linear polynomial 1 on the edge, so L == 0.
    EXPECT_EQ(rd.eval_at_0, FF{ 1 });
    EXPECT_EQ(rd.eval_at_1, FF{ 1 });
    EXPECT_EQ(rd.L_eval_at_0(), FF{ 0 });
    EXPECT_EQ(rd.L_eval_at_1(), FF{ 0 });

    // Round 1 update: eval_at_1 becomes 0, so L_eval_at_1 == 1.
    rd.update_evaluations(FF{ 7 }, /*round_idx=*/1);
    EXPECT_EQ(rd.eval_at_1, FF{ 0 });
    EXPECT_EQ(rd.L_eval_at_1(), FF{ 1 });
    EXPECT_EQ(rd.eval_at_0, FF{ 1 });
    EXPECT_EQ(rd.L_eval_at_0(), FF{ 0 });

    // Round 2 update: eval_at_0 gets multiplied by (1 - challenge); L_eval_at_0 is its complement.
    const FF challenge{ 5 };
    rd.update_evaluations(challenge, /*round_idx=*/2);
    EXPECT_EQ(rd.eval_at_0, FF{ 1 } - challenge);
    EXPECT_EQ(rd.L_eval_at_0(), challenge);
    EXPECT_EQ(rd.eval_at_1, FF{ 0 });
    EXPECT_EQ(rd.L_eval_at_1(), FF{ 1 });
}

TEST(RowDisablingPolynomial, EvaluateLAtChallengeIsOneMinusEvaluate)
{
    // L(u) + (1 - L(u)) == 1 for every u, log_n.
    std::vector<FF> u = { FF{ 2 }, FF{ 3 }, FF{ 5 }, FF{ 7 }, FF{ 11 } };
    for (size_t log_n : { size_t{ 2 }, size_t{ 3 }, size_t{ 4 }, size_t{ 5 } }) {
        const FF L = RowDisablingPolynomial<FF>::evaluate_L_at_challenge(u, log_n);
        const FF one_minus_L = RowDisablingPolynomial<FF>::evaluate_at_challenge(u, log_n);
        EXPECT_EQ(L + one_minus_L, FF{ 1 });
    }
}

TEST(RowDisablingPolynomial, EvaluateLAtChallengeMatchesProductForm)
{
    // Definition: L(u) = prod_{k>=2}(1 - u_k).
    std::vector<FF> u = { FF{ 2 }, FF{ 3 }, FF{ 5 }, FF{ 7 }, FF{ 11 } };
    const size_t log_n = u.size();

    FF expected{ 1 };
    for (size_t k = 2; k < log_n; ++k) {
        expected *= (FF{ 1 } - u[k]);
    }

    EXPECT_EQ(RowDisablingPolynomial<FF>::evaluate_L_at_challenge(u, log_n), expected);
}
