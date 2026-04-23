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

// The per-round evaluations of (1 - L) evolve as documented in the header: starting at (1, 1),
// round-1 update zeroes `eval_at_1`, and round-2+ updates scale `eval_at_0` by (1 - challenge).
TEST(RowDisablingPolynomial, UpdateEvaluationsMatchesSpec)
{
    RowDisablingPolynomial<FF> rd;
    EXPECT_EQ(rd.eval_at_0, FF{ 1 });
    EXPECT_EQ(rd.eval_at_1, FF{ 1 });

    rd.update_evaluations(FF{ 7 }, /*round_idx=*/1);
    EXPECT_EQ(rd.eval_at_0, FF{ 1 });
    EXPECT_EQ(rd.eval_at_1, FF{ 0 });

    const FF challenge{ 5 };
    rd.update_evaluations(challenge, /*round_idx=*/2);
    EXPECT_EQ(rd.eval_at_0, FF{ 1 } - challenge);
    EXPECT_EQ(rd.eval_at_1, FF{ 0 });
}

// `evaluate_at_challenge` returns `1 - ∏_{k≥2}(1 - u_k)`.
TEST(RowDisablingPolynomial, EvaluateAtChallengeMatchesProductForm)
{
    std::vector<FF> u = { FF{ 2 }, FF{ 3 }, FF{ 5 }, FF{ 7 }, FF{ 11 } };
    const size_t log_n = u.size();

    FF expected_L{ 1 };
    for (size_t k = 2; k < log_n; ++k) {
        expected_L *= (FF{ 1 } - u[k]);
    }
    const FF expected_one_minus_L = FF{ 1 } - expected_L;

    EXPECT_EQ(RowDisablingPolynomial<FF>::evaluate_at_challenge(u, log_n), expected_one_minus_L);
}
