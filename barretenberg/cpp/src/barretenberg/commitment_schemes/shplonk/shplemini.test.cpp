
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

    const size_t n = 16;
    const size_t log_n = 4;

    // Generate mock challenges
    Fr rho = Fr::random_element();
    Fr gemini_eval_challenge = Fr::random_element();
    Fr shplonk_batching_challenge = Fr::random_element();
    Fr shplonk_eval_challenge = Fr::random_element();

    // Generate multilinear polynomials and compute their commitments
    auto mle_opening_point = this->random_evaluation_point(log_n);
    auto poly1 = Polynomial::random(n);
    auto poly2 = Polynomial::random(n, /*shiftable*/ 1);
    Polynomial poly3(n);

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

    const size_t n = 16;
    const size_t log_n = 4;

    // Generate mock challenges
    Fr rho = Fr::random_element();
    Fr gemini_eval_challenge = Fr::random_element();
    Fr shplonk_batching_challenge = Fr::random_element();
    Fr shplonk_eval_challenge = Fr::random_element();

    // Generate multilinear polynomials and compute their commitments
    auto mle_opening_point = this->random_evaluation_point(log_n);
    auto poly1 = Polynomial::random(n);
    auto poly2 = Polynomial::random(n, /*shiftable*/ 1);
    Polynomial poly3 = Polynomial::shiftable(n);

    // Evaluate the polynomials at the multivariate challenge, poly3 is not evaluated, because it is 0.
    auto eval1 = poly1.evaluate_mle(mle_opening_point);
    auto eval2 = poly2.evaluate_mle(mle_opening_point);
    Fr eval3{ 0 };
    Fr eval3_shift{ 0 };
    auto eval2_shift = poly2.evaluate_mle(mle_opening_point, true);

    // Collect multilinear evaluations
    std::vector<Fr> multilinear_evaluations = { eval1, eval2, eval3, eval2_shift, eval3_shift };
    std::vector<Fr> rhos = gemini::powers_of_rho(rho, multilinear_evaluations.size());

    Polynomial batched_unshifted(n);
    Polynomial batched_to_be_shifted = Polynomial::shiftable(n);
    batched_unshifted.add_scaled(poly1, rhos[0]);
    batched_unshifted.add_scaled(poly2, rhos[1]);
    batched_unshifted.add_scaled(poly3, rhos[2]);
    batched_to_be_shifted.add_scaled(poly2, rhos[3]);
    batched_to_be_shifted.add_scaled(poly3, rhos[4]);

    // Compute:
    // - (d+1) opening pairs: {r, \hat{a}_0}, {-r^{2^i}, a_i}, i = 0, ..., d-1
    // - (d+1) Fold polynomials Fold_{r}^(0), Fold_{-r}^(0), and Fold^(i), i = 0, ..., d-1
    auto fold_polynomials = GeminiProver::compute_fold_polynomials(
        log_n, mle_opening_point, std::move(batched_unshifted), std::move(batched_to_be_shifted));

    std::vector<Commitment> prover_commitments;
    for (size_t l = 0; l < log_n - 1; ++l) {
        auto commitment = this->ck()->commit(fold_polynomials[l + 2]);
        prover_commitments.emplace_back(commitment);
    }

    const auto opening_claims =
        GeminiProver::compute_fold_polynomial_evaluations(log_n, std::move(fold_polynomials), gemini_eval_challenge);

    std::vector<Fr> prover_evaluations;
    for (size_t l = 0; l < log_n; ++l) {
        const auto& evaluation = opening_claims[l + 1].opening_pair.evaluation;
        prover_evaluations.emplace_back(evaluation);
    }

    std::vector<Fr> r_squares = gemini::powers_of_evaluation_challenge(gemini_eval_challenge, log_n);

    GroupElement expected_result = GroupElement::zero();
    std::vector<Fr> expected_inverse_vanishing_evals(log_n + 1);
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
        ShplonkVerifier::compute_inverted_gemini_denominators(log_n + 1, shplonk_eval_challenge, r_squares);

    std::vector<Commitment> commitments;
    std::vector<Fr> scalars;
    Fr expected_constant_term_accumulator{ 0 };

    ShpleminiVerifier::batch_gemini_claims_received_from_prover(log_n,
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

/**
 * @brief Libra masking univariates are used in sumcheck to prevent the leakage of witness data through the evaluations
 * of round univariates. Here we test the opening of log_n Libra masking univariates batched with the opening of several
 * prover polynomials and their shifts.
 *
 */
// TYPED_TEST(ShpleminiTest, ShpleminiWithMaskingLibraUnivariates)
// {
//     using ShpleminiProver = ShpleminiProver_<TypeParam>;
//     using ShpleminiVerifier = ShpleminiVerifier_<TypeParam>;
//     using KZG = KZG<TypeParam>;
//     using IPA = IPA<TypeParam>;
//     using Fr = typename TypeParam::ScalarField;
//     using Commitment = typename TypeParam::AffineElement;
//     using Polynomial = typename bb::Polynomial<Fr>;

//     const size_t n = 16;
//     const size_t log_n = 4;
//     // In practice, the length of Libra univariates is equal to FLAVOR::BATCHED_RELATION_PARTIAL_LENGTH
//     const size_t LIBRA_UNIVARIATE_LENGTH = 12;

//     std::array<Fr, LIBRA_UNIVARIATE_LENGTH> interpolation_domain;
//     for (size_t idx = 0; idx < LIBRA_UNIVARIATE_LENGTH; idx++) {
//         interpolation_domain[idx] = Fr(idx);
//     }
//     // Generate multilinear polynomials, their commitments (genuine and mocked) and evaluations (genuine) at a
//     // random point.
//     auto mle_opening_point = this->random_evaluation_point(log_n); // sometimes denoted 'u'
//     auto poly1 = Polynomial::random(n);
//     auto poly2 = Polynomial::random(n, 1);
//     auto poly3 = Polynomial::random(n, 1);
//     auto poly4 = Polynomial::random(n);

//     std::vector<bb::Univariate<Fr, LIBRA_UNIVARIATE_LENGTH>> libra_univariates;
//     std::vector<Commitment> libra_commitments;
//     std::vector<Fr> libra_evaluations;
//     for (size_t idx = 0; idx < log_n; idx++) {
//         // generate random polynomial
//         Polynomial libra_polynomial = Polynomial::random(LIBRA_UNIVARIATE_LENGTH);
//         // create a univariate with the same coefficients (to store an array instead of a vector)
//         bb::Univariate<Fr, LIBRA_UNIVARIATE_LENGTH> libra_univariate;
//         for (size_t i = 0; i < LIBRA_UNIVARIATE_LENGTH; i++) {
//             libra_univariate.value_at(i) = libra_polynomial[i];
//         }
//         libra_univariates.push_back(libra_univariate);

//         // commit to libra polynomial and populate the vector of libra commitments
//         Commitment libra_commitment = this->commit(libra_polynomial);
//         libra_commitments.push_back(libra_commitment);

//         // evaluate current libra univariate at the corresponding challenge and store the value in libra evaluations
//         libra_evaluations.push_back(libra_polynomial.evaluate(mle_opening_point[idx]));
//     }

//     Commitment commitment1 = this->commit(poly1);
//     Commitment commitment2 = this->commit(poly2);
//     Commitment commitment3 = this->commit(poly3);
//     Commitment commitment4 = this->commit(poly4);
//     std::vector<Commitment> unshifted_commitments = { commitment1, commitment2, commitment3, commitment4 };
//     std::vector<Commitment> shifted_commitments = { commitment2, commitment3 };
//     auto eval1 = poly1.evaluate_mle(mle_opening_point);
//     auto eval2 = poly2.evaluate_mle(mle_opening_point);
//     auto eval3 = poly3.evaluate_mle(mle_opening_point);
//     auto eval4 = poly4.evaluate_mle(mle_opening_point);
//     auto eval2_shift = poly2.evaluate_mle(mle_opening_point, true);
//     auto eval3_shift = poly3.evaluate_mle(mle_opening_point, true);

//     // Collect multilinear evaluations for input to prover
//     // std::vector<Fr> multilinear_evaluations = { eval1, eval2, eval3, eval4, eval2_shift, eval3_shift };

//     auto prover_transcript = NativeTranscript::prover_init_empty();

//     // Run the full prover PCS protocol:
//     auto opening_claim = ShpleminiProver::prove(Fr{ n },
//                                                 RefArray{ poly1, poly2, poly3, poly4 },
//                                                 RefArray{ poly2, poly3 },
//                                                 mle_opening_point,
//                                                 this->ck(),
//                                                 prover_transcript,
//                                                 libra_univariates,
//                                                 libra_evaluations);
//     if constexpr (std::is_same_v<TypeParam, curve::Grumpkin>) {
//         IPA::compute_opening_proof(this->ck(), opening_claim, prover_transcript);
//     } else {
//         KZG::compute_opening_proof(this->ck(), opening_claim, prover_transcript);
//     }

//     // Run the full verifier PCS protocol with genuine opening claims (genuine commitment, genuine evaluation)

//     auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);

//     // Gemini verifier output:
//     // - claim: d+1 commitments to Fold_{r}^(0), Fold_{-r}^(0), Fold^(l), d+1 evaluations a_0_pos, a_l, l = 0:d-1
//     auto batch_opening_claim = ShpleminiVerifier::compute_batch_opening_claim(n,
//                                                                               RefVector(unshifted_commitments),
//                                                                               RefVector(shifted_commitments),
//                                                                               RefArray{ eval1, eval2, eval3, eval4 },
//                                                                               RefArray{ eval2_shift, eval3_shift },
//                                                                               mle_opening_point,
//                                                                               this->vk()->get_g1_identity(),
//                                                                               verifier_transcript,
//                                                                               {},
//                                                                               RefVector(libra_commitments),
//                                                                               libra_evaluations);

//     if constexpr (std::is_same_v<TypeParam, curve::Grumpkin>) {
//         auto result = IPA::reduce_verify_batch_opening_claim(batch_opening_claim, this->vk(), verifier_transcript);
//         EXPECT_EQ(result, true);
//     } else {
//         const auto pairing_points = KZG::reduce_verify_batch_opening_claim(batch_opening_claim, verifier_transcript);
//         // Final pairing check: e([Q] - [Q_z] + z[W], [1]_2) = e([W], [x]_2)
//         EXPECT_EQ(this->vk()->pairing_check(pairing_points[0], pairing_points[1]), true);
//     }
// }
} // namespace bb
