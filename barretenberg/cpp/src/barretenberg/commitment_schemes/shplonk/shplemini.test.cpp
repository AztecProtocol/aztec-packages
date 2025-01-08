
#include "shplemini.hpp"
#include "../commitment_key.test.hpp"
#include "../gemini/gemini.hpp"
#include "../kzg/kzg.hpp"
#include "../shplonk/shplonk.hpp"
#include "../utils/batch_mul_native.hpp"
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/small_subgroup_ipa/small_subgroup_ipa.test.cpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"

#include <gtest/gtest.h>
#include <vector>

namespace bb {

template <class Flavor> class ShpleminiTest : public CommitmentTest<typename Flavor::Curve> {
  public:
    using Curve = typename Flavor::Curve;
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using GroupElement = typename Curve::Element;
    using Polynomial = bb::Polynomial<Fr>;
    static constexpr size_t n = 32;
    static constexpr size_t log_n = 5;
};

using FlavorTypes = ::testing::Types<TestBn254Flavor, TestGrumpkinFlavor>;

TYPED_TEST_SUITE(ShpleminiTest, FlavorTypes);

// This test checks that batch_multivariate_opening_claims method operates correctly
TYPED_TEST(ShpleminiTest, CorrectnessOfMultivariateClaimBatching)
{
    using Curve = typename TypeParam::Curve;
    using ShpleminiVerifier = ShpleminiVerifier_<Curve>;
    using Fr = typename Curve::ScalarField;
    using GroupElement = typename Curve::Element;
    using Commitment = typename Curve::AffineElement;
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
    using Curve = typename TypeParam::Curve;
    using GeminiProver = GeminiProver_<Curve>;
    using ShpleminiVerifier = ShpleminiVerifier_<Curve>;
    using ShplonkVerifier = ShplonkVerifier_<Curve>;
    using Fr = typename Curve::ScalarField;
    using GroupElement = typename Curve::Element;
    using Commitment = typename Curve::AffineElement;
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

TYPED_TEST(ShpleminiTest, ShpleminiWithZK)
{
    using ZKData = ZKSumcheckData<TypeParam>;
    using Curve = TypeParam::Curve;
    using ShpleminiProver = ShpleminiProver_<Curve>;
    using ShpleminiVerifier = ShpleminiVerifier_<Curve>;
    using Fr = typename Curve::ScalarField;
    // using GroupElement = typename Curve::Element;
    using Commitment = typename Curve::AffineElement;
    using Polynomial = typename bb::Polynomial<Fr>;

    auto prover_transcript = TypeParam::Transcript::prover_init_empty();
    std::shared_ptr<typename TypeParam::CommitmentKey> ck;
    ck = CreateCommitmentKey<typename TypeParam::CommitmentKey>();

    ZKData zk_sumcheck_data(this->log_n, prover_transcript, ck);

    // Generate multilinear polynomials and compute their commitments
    auto const_size_mle_opening_point = this->random_evaluation_point(CONST_PROOF_SIZE_LOG_N);

    auto poly1 = Polynomial::random(this->n);
    auto poly2 = Polynomial::random(this->n, /*shiftable*/ 1);
    Polynomial poly3 = Polynomial::shiftable(this->n);

    Commitment commitment1 = this->commit(poly1);
    Commitment commitment2 = this->commit(poly2);
    Commitment commitment3 = this->commit(poly3);
    std::vector<Fr> mle_opening_point(const_size_mle_opening_point.begin(),
                                      const_size_mle_opening_point.begin() + this->log_n);
    // Evaluate the polynomials at the multivariate challenge, poly3 is not evaluated, because it is 0.
    auto eval1 = poly1.evaluate_mle(mle_opening_point);
    auto eval2 = poly2.evaluate_mle(mle_opening_point);
    Fr eval3{ 0 };
    Fr eval3_shift{ 0 };
    auto eval2_shift = poly2.evaluate_mle(mle_opening_point, true);

    const Fr claimed_inner_product = SmallSubgroupIPATest<TypeParam>::compute_claimed_inner_product(
        zk_sumcheck_data, const_size_mle_opening_point, this->log_n);

    prover_transcript->template send_to_verifier("Libra:claimed_evaluation", claimed_inner_product);

    auto small_subgroup_ipa_prover = SmallSubgroupIPAProver<TypeParam>(
        zk_sumcheck_data, const_size_mle_opening_point, claimed_inner_product, prover_transcript, ck);

    auto opening_claim = ShpleminiProver::prove(this->n,
                                                RefVector{ poly1, poly2, poly3 },
                                                RefVector{ poly2, poly3 },
                                                const_size_mle_opening_point,
                                                ck,
                                                prover_transcript,
                                                small_subgroup_ipa_prover.get_witness_polynomials());

    if constexpr (std::is_same_v<TypeParam, TestGrumpkinFlavor>) {
        IPA<Curve>::compute_opening_proof(this->ck(), opening_claim, prover_transcript);
    } else {
        KZG<Curve>::compute_opening_proof(this->ck(), opening_claim, prover_transcript);
    }
    auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);

    std::array<Commitment, NUM_LIBRA_COMMITMENTS> libra_commitments = {};
    libra_commitments[0] =
        verifier_transcript->template receive_from_prover<Commitment>("Libra:concatenation_commitment");

    // Send the Libra total sum to the transcript
    auto libra_total_sum = verifier_transcript->template receive_from_prover<Fr>("Libra:Sum");

    info(libra_total_sum == claimed_inner_product);

    // Receive the Libra challenge from the transcript
    auto libra_challenge = verifier_transcript->template get_challenge<Fr>("Libra:Challenge");

    info(libra_challenge == zk_sumcheck_data.libra_challenge);

    auto libra_evaluation = verifier_transcript->template receive_from_prover<Fr>("Libra:claimed_evaluation");
    info("libra eval", libra_evaluation == claimed_inner_product);

    libra_commitments[1] = verifier_transcript->template receive_from_prover<Commitment>("Libra:big_sum_commitment");
    libra_commitments[2] = verifier_transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");

    bool consistency_checked = true;

    const auto batch_opening_claim =
        ShpleminiVerifier::compute_batch_opening_claim(this->n,
                                                       RefVector{ commitment1, commitment2, commitment3 },
                                                       RefVector{ commitment2, commitment3 },
                                                       RefArray{ eval1, eval2, eval3 },
                                                       RefArray{ eval2_shift, eval3_shift },
                                                       const_size_mle_opening_point,
                                                       this->vk()->get_g1_identity(),
                                                       verifier_transcript,
                                                       {},
                                                       true,
                                                       &consistency_checked,
                                                       libra_commitments,
                                                       libra_evaluation);
    if constexpr (std::is_same_v<TypeParam, TestGrumpkinFlavor>) {
        auto result =
            IPA<Curve>::reduce_verify_batch_opening_claim(batch_opening_claim, this->vk(), verifier_transcript);
        EXPECT_EQ(result, true);
    } else {
        const auto pairing_points =
            KZG<Curve>::reduce_verify_batch_opening_claim(batch_opening_claim, verifier_transcript);

        // Final pairing check: e([Q] - [Q_z] + z[W], [1]_2) = e([W], [x]_2)
        EXPECT_EQ(this->vk()->pairing_check(pairing_points[0], pairing_points[1]), true);
    }
}

} // namespace bb
