
#include "shplemini.hpp"
#include "../commitment_key.test.hpp"
#include "../gemini/gemini.hpp"
#include "../kzg/kzg.hpp"
#include "../shplonk/shplonk.hpp"
#include "../utils/batch_mul_native.hpp"
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"

#include <gtest/gtest.h>
#include <vector>

namespace bb {

template <class Curve> class ShpleminiTest : public CommitmentTest<Curve> {
  public:
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using GroupElement = typename Curve::Element;
    using Polynomial = bb::Polynomial<Fr>;
    static constexpr size_t n = 16;
    static constexpr size_t log_n = 4;
};

using CurveTypes = ::testing::Types<curve::BN254, curve::Grumpkin>;

TYPED_TEST_SUITE(ShpleminiTest, CurveTypes);

// This test checks that batch_multivariate_opening_claims method operates correctly
TYPED_TEST(ShpleminiTest, CorrectnessOfMultivariateClaimBatching)
{
    using ShpleminiVerifier = ShpleminiVerifier_<TypeParam>;
    using Fr = typename TypeParam::ScalarField;
    using GroupElement = typename TypeParam::Element;
    using Commitment = typename TypeParam::AffineElement;
    using Polynomial = typename bb::Polynomial<Fr>;

    // Generate mock challenges
    Fr rho = Fr::random_element();
    Fr gemini_eval_challenge = Fr::random_element();
    Fr shplonk_batching_challenge = Fr::random_element();
    Fr shplonk_eval_challenge = Fr::random_element();

    // Generate multilinear polynomials and compute their commitments
    auto mle_opening_point = this->random_evaluation_point(this->log_n);
    auto poly1 = Polynomial::random(this->n);
    auto poly2 = Polynomial::random(this->n, /*shiftable*/ 1);
    Polynomial poly3(this->n);

    Commitment commitment1 = this->commit(poly1);
    Commitment commitment2 = this->commit(poly2);
    Commitment commitment3 = this->commit(poly3);
    EXPECT_TRUE(commitment3.is_point_at_infinity());

    std::vector<Commitment> unshifted_commitments = { commitment1, commitment2, commitment3 };
    std::vector<Commitment> shifted_commitments = { commitment2, commitment3 };

    // Evaluate the polynomials at the multivariate challenge, poly3 is not evaluated, because it is 0.
    auto eval1 = poly1.evaluate_mle(mle_opening_point);
    auto eval2 = poly2.evaluate_mle(mle_opening_point);
    Fr eval3{ 0 };
    Fr eval3_shift{ 0 };
    auto eval2_shift = poly2.evaluate_mle(mle_opening_point, true);

    // Collect multilinear evaluations
    std::vector<Fr> multilinear_evaluations = { eval1, eval2, eval3, eval2_shift, eval3_shift };
    std::vector<Fr> rhos = gemini::powers_of_rho(rho, multilinear_evaluations.size());

    // Compute batched multivariate evaluation
    Fr batched_evaluation =
        std::inner_product(multilinear_evaluations.begin(), multilinear_evaluations.end(), rhos.begin(), Fr::zero());

    // Compute batched commitments manually
    GroupElement batched_commitment_unshifted = commitment1 * rhos[0] + commitment2 * rhos[1] + commitment3 * rhos[2];
    GroupElement batched_commitment_to_be_shifted = commitment2 * rhos[3] + commitment3 * rhos[4];

    // Compute expected result manually
    GroupElement commitment_to_univariate =
        batched_commitment_unshifted + batched_commitment_to_be_shifted * gemini_eval_challenge.invert();
    GroupElement commitment_to_univariate_neg =
        batched_commitment_unshifted - batched_commitment_to_be_shifted * gemini_eval_challenge.invert();

    GroupElement expected_result =
        commitment_to_univariate * (shplonk_eval_challenge - gemini_eval_challenge).invert() +
        commitment_to_univariate_neg *
            (shplonk_batching_challenge * (shplonk_eval_challenge + gemini_eval_challenge).invert());

    // Run the ShepliminiVerifier batching method
    std::vector<Commitment> commitments;
    std::vector<Fr> scalars;
    Fr verifier_batched_evaluation{ 0 };

    Fr unshifted_scalar = (shplonk_eval_challenge - gemini_eval_challenge).invert() +
                          shplonk_batching_challenge * (shplonk_eval_challenge + gemini_eval_challenge).invert();

    Fr shifted_scalar = gemini_eval_challenge.invert() *
                        ((shplonk_eval_challenge - gemini_eval_challenge).invert() -
                         shplonk_batching_challenge * (shplonk_eval_challenge + gemini_eval_challenge).invert());

    ShpleminiVerifier::batch_multivariate_opening_claims(RefVector(unshifted_commitments),
                                                         RefVector(shifted_commitments),
                                                         RefArray{ eval1, eval2, eval3 },
                                                         RefArray{ eval2_shift, eval3_shift },
                                                         rho,
                                                         unshifted_scalar,
                                                         shifted_scalar,
                                                         commitments,
                                                         scalars,
                                                         verifier_batched_evaluation);

    // Final pairing check
    GroupElement shplemini_result = batch_mul_native(commitments, scalars);

    EXPECT_EQ(commitments.size(), unshifted_commitments.size() + shifted_commitments.size());
    EXPECT_EQ(batched_evaluation, verifier_batched_evaluation);
    EXPECT_EQ(-expected_result, shplemini_result);
}
TYPED_TEST(ShpleminiTest, CorrectnessOfGeminiClaimBatching)
{
    using GeminiProver = GeminiProver_<TypeParam>;
    using ShpleminiVerifier = ShpleminiVerifier_<TypeParam>;
    using ShplonkVerifier = ShplonkVerifier_<TypeParam>;
    using Fr = typename TypeParam::ScalarField;
    using GroupElement = typename TypeParam::Element;
    using Commitment = typename TypeParam::AffineElement;
    using Polynomial = typename bb::Polynomial<Fr>;

    // Generate mock challenges
    Fr rho = Fr::random_element();
    Fr gemini_eval_challenge = Fr::random_element();
    Fr shplonk_batching_challenge = Fr::random_element();
    Fr shplonk_eval_challenge = Fr::random_element();

    // Generate multilinear polynomials and compute their commitments
    auto mle_opening_point = this->random_evaluation_point(this->log_n);
    auto poly1 = Polynomial::random(this->n);
    auto poly2 = Polynomial::random(this->n, /*shiftable*/ 1);
    Polynomial poly3 = Polynomial::shiftable(this->n);

    // Evaluate the polynomials at the multivariate challenge, poly3 is not evaluated, because it is 0.
    auto eval1 = poly1.evaluate_mle(mle_opening_point);
    auto eval2 = poly2.evaluate_mle(mle_opening_point);
    Fr eval3{ 0 };
    Fr eval3_shift{ 0 };
    auto eval2_shift = poly2.evaluate_mle(mle_opening_point, true);

    // Collect multilinear evaluations
    std::vector<Fr> multilinear_evaluations = { eval1, eval2, eval3, eval2_shift, eval3_shift };
    std::vector<Fr> rhos = gemini::powers_of_rho(rho, multilinear_evaluations.size());

    Polynomial batched_unshifted(this->n);
    Polynomial batched_to_be_shifted = Polynomial::shiftable(this->n);
    batched_unshifted.add_scaled(poly1, rhos[0]);
    batched_unshifted.add_scaled(poly2, rhos[1]);
    batched_unshifted.add_scaled(poly3, rhos[2]);
    batched_to_be_shifted.add_scaled(poly2, rhos[3]);
    batched_to_be_shifted.add_scaled(poly3, rhos[4]);

    // Compute:
    // - (d+1) opening pairs: {r, \hat{a}_0}, {-r^{2^i}, a_i}, i = 0, ..., d-1
    // - (d+1) Fold polynomials Fold_{r}^(0), Fold_{-r}^(0), and Fold^(i), i = 0, ..., d-1
    auto fold_polynomials = GeminiProver::compute_fold_polynomials(
        this->log_n, mle_opening_point, std::move(batched_unshifted), std::move(batched_to_be_shifted));

    std::vector<Commitment> prover_commitments;
    for (size_t l = 0; l < this->log_n - 1; ++l) {
        auto commitment = this->ck()->commit(fold_polynomials[l + 2]);
        prover_commitments.emplace_back(commitment);
    }

    const auto opening_claims = GeminiProver::compute_fold_polynomial_evaluations(
        this->log_n, std::move(fold_polynomials), gemini_eval_challenge);

    std::vector<Fr> prover_evaluations;
    for (size_t l = 0; l < this->log_n; ++l) {
        const auto& evaluation = opening_claims[l + 1].opening_pair.evaluation;
        prover_evaluations.emplace_back(evaluation);
    }

    std::vector<Fr> r_squares = gemini::powers_of_evaluation_challenge(gemini_eval_challenge, this->log_n);

    GroupElement expected_result = GroupElement::zero();
    std::vector<Fr> expected_inverse_vanishing_evals(this->log_n + 1);
    // Compute expected inverses
    expected_inverse_vanishing_evals[0] = (shplonk_eval_challenge - r_squares[0]).invert();
    expected_inverse_vanishing_evals[1] = (shplonk_eval_challenge + r_squares[0]).invert();
    expected_inverse_vanishing_evals[2] = (shplonk_eval_challenge + r_squares[1]).invert();
    expected_inverse_vanishing_evals[3] = (shplonk_eval_challenge + r_squares[2]).invert();
    expected_inverse_vanishing_evals[4] = (shplonk_eval_challenge + r_squares[3]).invert();

    Fr current_challenge{ shplonk_batching_challenge * shplonk_batching_challenge };
    for (size_t idx = 0; idx < prover_commitments.size(); ++idx) {
        expected_result -= prover_commitments[idx] * current_challenge * expected_inverse_vanishing_evals[idx + 2];
        current_challenge *= shplonk_batching_challenge;
    }

    // Run the ShepliminiVerifier batching method
    std::vector<Fr> inverse_vanishing_evals =
        ShplonkVerifier::compute_inverted_gemini_denominators(this->log_n + 1, shplonk_eval_challenge, r_squares);

    std::vector<Commitment> commitments;
    std::vector<Fr> scalars;
    Fr expected_constant_term_accumulator{ 0 };

    ShpleminiVerifier::batch_gemini_claims_received_from_prover(this->log_n,
                                                                prover_commitments,
                                                                prover_evaluations,
                                                                inverse_vanishing_evals,
                                                                shplonk_batching_challenge,
                                                                commitments,
                                                                scalars,
                                                                expected_constant_term_accumulator);

    // Compute the group element using the output of Shplemini method
    GroupElement shplemini_result = batch_mul_native(commitments, scalars);

    EXPECT_EQ(shplemini_result, expected_result);
}

} // namespace bb
