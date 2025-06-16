
#include "shplemini.hpp"
#include "../commitment_key.test.hpp"
#include "../gemini/gemini.hpp"
#include "../kzg/kzg.hpp"
#include "../shplonk/shplonk.hpp"
#include "../utils/batch_mul_native.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/small_subgroup_ipa/small_subgroup_ipa.hpp"
#include "barretenberg/commitment_schemes/utils/mock_witness_generator.hpp"
#include "barretenberg/commitment_schemes/utils/test_settings.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

#include <gtest/gtest.h>
#include <vector>

namespace bb {

template <class Flavor> class ShpleminiTest : public CommitmentTest<typename Flavor::Curve> {
  public:
    // Size of the test polynomials
    static constexpr size_t n = 32;
    static constexpr size_t log_n = 5;
    // Total number of random polynomials in each test
    static constexpr size_t num_polynomials = 7;
    // Number of shiftable polynomials
    static constexpr size_t num_shiftable = 2;
    // Number of polynomials to be right shifted by k
    static constexpr size_t num_right_shiftable_by_k = 2;

    // The length of the mock sumcheck univariates.
    static constexpr size_t sumcheck_univariate_length = 24;

    using Fr = typename Flavor::Curve::ScalarField;
    using GroupElement = typename Flavor::Curve::Element;
    using Commitment = typename Flavor::Curve::AffineElement;
    using CK = typename Flavor::CommitmentKey;
};

using TestSettings = ::testing::Types<BN254Settings, GrumpkinSettings>;

TYPED_TEST_SUITE(ShpleminiTest, TestSettings);

// This test checks that batch_multivariate_opening_claims method operates correctly
TYPED_TEST(ShpleminiTest, CorrectnessOfMultivariateClaimBatching)
{
    using Curve = typename TypeParam::Curve;
    using Fr = typename Curve::ScalarField;
    using GroupElement = typename Curve::Element;
    using Commitment = typename Curve::AffineElement;
    using CK = typename TypeParam::CommitmentKey;

    CK ck = create_commitment_key<CK>(this->n);

    // Generate mock challenges
    Fr rho = Fr::random_element();
    Fr gemini_eval_challenge = Fr::random_element();
    Fr shplonk_batching_challenge = Fr::random_element();
    Fr shplonk_eval_challenge = Fr::random_element();

    // Generate multilinear polynomials and compute their commitments
    auto mle_opening_point = this->random_evaluation_point(this->log_n);

    MockClaimGenerator<Curve> mock_claims(this->n,
                                          /*num_polynomials*/ this->num_polynomials,
                                          /*num_to_be_shifted*/ this->num_shiftable,
                                          /*num_to_be_right_shifted_by_k*/ this->num_right_shiftable_by_k,
                                          mle_opening_point,
                                          ck);

    // Collect multilinear evaluations
    std::vector<Fr> rhos = gemini::powers_of_rho(rho, this->num_polynomials + this->num_shiftable);

    // Lambda to compute batched multivariate evaluation
    auto update_batched_eval = [&](Fr& batched_eval, const std::vector<Fr>& evaluations, Fr& rho_power) {
        for (auto& eval : evaluations) {
            batched_eval += eval * rho_power;
            rho_power *= rho;
        }
    };

    Fr rho_power(1);
    Fr batched_evaluation(0);
    update_batched_eval(batched_evaluation, mock_claims.unshifted.evals, rho_power);
    update_batched_eval(batched_evaluation, mock_claims.to_be_shifted.evals, rho_power);
    update_batched_eval(batched_evaluation, mock_claims.to_be_right_shifted_by_k.evals, rho_power);

    // Lambda to compute batched commitment
    auto compute_batched_commitment = [&](const std::vector<Commitment>& commitments, Fr& rho_power) {
        GroupElement batched = GroupElement::zero();
        for (auto& comm : commitments) {
            batched += comm * rho_power;
            rho_power *= rho;
        }
        return batched;
    };

    // Compute batched commitments manually
    rho_power = Fr(1);
    GroupElement batched_commitment_unshifted =
        compute_batched_commitment(mock_claims.unshifted.commitments, rho_power);
    GroupElement batched_commitment_to_be_shifted =
        compute_batched_commitment(mock_claims.to_be_shifted.commitments, rho_power);
    GroupElement batched_commitment_to_be_right_shifted_by_k =
        compute_batched_commitment(mock_claims.to_be_right_shifted_by_k.commitments, rho_power);

    // Compute expected result manually
    GroupElement to_be_right_shifted_by_k_contribution =
        batched_commitment_to_be_right_shifted_by_k *
        gemini_eval_challenge.pow(mock_claims.claim_batcher.k_shift_magnitude);
    GroupElement to_be_shifted_contribution = batched_commitment_to_be_shifted * gemini_eval_challenge.invert();

    GroupElement commitment_to_univariate_pos =
        batched_commitment_unshifted + to_be_right_shifted_by_k_contribution + to_be_shifted_contribution;

    GroupElement commitment_to_univariate_neg =
        batched_commitment_unshifted + to_be_right_shifted_by_k_contribution - to_be_shifted_contribution;

    GroupElement expected_result =
        commitment_to_univariate_pos * (shplonk_eval_challenge - gemini_eval_challenge).invert() +
        commitment_to_univariate_neg *
            (shplonk_batching_challenge * (shplonk_eval_challenge + gemini_eval_challenge).invert());

    // Run the ShepliminiVerifier batching method
    std::vector<Commitment> commitments;
    std::vector<Fr> scalars;
    Fr verifier_batched_evaluation{ 0 };

    Fr inverted_vanishing_eval_pos = (shplonk_eval_challenge - gemini_eval_challenge).invert();
    Fr inverted_vanishing_eval_neg = (shplonk_eval_challenge + gemini_eval_challenge).invert();

    std::vector<Fr> inverted_vanishing_evals = { inverted_vanishing_eval_pos, inverted_vanishing_eval_neg };

    mock_claims.claim_batcher.compute_scalars_for_each_batch(
        inverted_vanishing_evals, shplonk_batching_challenge, gemini_eval_challenge);

    rho_power = Fr{ 1 };
    mock_claims.claim_batcher.update_batch_mul_inputs_and_batched_evaluation(
        commitments, scalars, verifier_batched_evaluation, rho, rho_power);

    // Final pairing check
    GroupElement shplemini_result = batch_mul_native(commitments, scalars);

    EXPECT_EQ(commitments.size(),
              mock_claims.unshifted.commitments.size() + mock_claims.to_be_shifted.commitments.size() +
                  mock_claims.to_be_right_shifted_by_k.commitments.size());
    EXPECT_EQ(batched_evaluation, verifier_batched_evaluation);
    EXPECT_EQ(-expected_result, shplemini_result);
}
TYPED_TEST(ShpleminiTest, CorrectnessOfGeminiClaimBatching)
{
    using Curve = TypeParam::Curve;
    using GeminiProver = GeminiProver_<Curve>;
    using ShpleminiVerifier = ShpleminiVerifier_<Curve>;
    using ShplonkVerifier = ShplonkVerifier_<Curve>;
    using Fr = typename Curve::ScalarField;
    using GroupElement = typename Curve::Element;
    using Commitment = typename Curve::AffineElement;
    using Polynomial = typename bb::Polynomial<Fr>;
    using CK = typename TypeParam::CommitmentKey;

    CK ck = create_commitment_key<CK>(this->n);

    // Generate mock challenges
    Fr rho = Fr::random_element();
    Fr gemini_eval_challenge = Fr::random_element();
    Fr shplonk_batching_challenge = Fr::random_element();

    std::vector<Fr> shplonk_batching_challenge_powers =
        compute_shplonk_batching_challenge_powers(shplonk_batching_challenge, this->log_n);

    Fr shplonk_eval_challenge = Fr::random_element();

    std::vector<Fr> mle_opening_point = this->random_evaluation_point(this->log_n);

    MockClaimGenerator<Curve> mock_claims(this->n,
                                          /*num_polynomials*/ this->num_polynomials,
                                          /*num_to_be_shifted*/ this->num_shiftable,
                                          /*num_to_be_right_shifted_by_k*/ this->num_right_shiftable_by_k,
                                          mle_opening_point,
                                          ck);

    // Collect multilinear evaluations
    std::vector<Fr> rhos = gemini::powers_of_rho(rho, this->num_polynomials + this->num_shiftable);

    Fr running_scalar = Fr(1);
    Polynomial batched = mock_claims.polynomial_batcher.compute_batched(rho, running_scalar);

    // Compute:
    // - (d+1) opening pairs: {r, \hat{a}_0}, {-r^{2^i}, a_i}, i = 0, ..., d-1
    // - (d+1) Fold polynomials Fold_{r}^(0), Fold_{-r}^(0), and Fold^(i), i = 0, ..., d-1
    auto fold_polynomials = GeminiProver::compute_fold_polynomials(this->log_n, mle_opening_point, batched);

    std::vector<Commitment> prover_commitments;
    for (size_t l = 0; l < this->log_n - 1; ++l) {
        auto commitment = ck.commit(fold_polynomials[l]);
        prover_commitments.emplace_back(commitment);
    }

    auto [A_0_pos, A_0_neg] =
        mock_claims.polynomial_batcher.compute_partially_evaluated_batch_polynomials(gemini_eval_challenge);

    const auto opening_claims = GeminiProver::construct_univariate_opening_claims(
        this->log_n, std::move(A_0_pos), std::move(A_0_neg), std::move(fold_polynomials), gemini_eval_challenge);

    std::vector<Fr> prover_evaluations;
    for (size_t l = 0; l < this->log_n; ++l) {
        const auto& evaluation = opening_claims[l + 1].opening_pair.evaluation;
        prover_evaluations.emplace_back(evaluation);
    }

    std::vector<Fr> r_squares = gemini::powers_of_evaluation_challenge(gemini_eval_challenge, this->log_n);

    GroupElement expected_result = GroupElement::zero();
    std::vector<Fr> expected_inverse_vanishing_evals;
    expected_inverse_vanishing_evals.reserve(2 * this->log_n);
    // Compute expected inverses
    for (size_t idx = 0; idx < this->log_n; idx++) {
        expected_inverse_vanishing_evals.emplace_back((shplonk_eval_challenge - r_squares[idx]).invert());
        expected_inverse_vanishing_evals.emplace_back((shplonk_eval_challenge + r_squares[idx]).invert());
    }

    Fr current_challenge{ shplonk_batching_challenge * shplonk_batching_challenge };
    for (size_t idx = 0; idx < prover_commitments.size(); ++idx) {
        expected_result -= prover_commitments[idx] * current_challenge * expected_inverse_vanishing_evals[2 * idx + 2];
        current_challenge *= shplonk_batching_challenge;
        expected_result -= prover_commitments[idx] * current_challenge * expected_inverse_vanishing_evals[2 * idx + 3];
        current_challenge *= shplonk_batching_challenge;
    }

    // Run the ShepliminiVerifier batching method
    std::vector<Fr> inverse_vanishing_evals =
        ShplonkVerifier::compute_inverted_gemini_denominators(shplonk_eval_challenge, r_squares);

    Fr expected_constant_term_accumulator{ 0 };
    std::vector<Fr> padding_indicator_array(this->log_n, Fr{ 1 });

    std::vector<Fr> gemini_fold_pos_evaluations =
        GeminiVerifier_<Curve>::compute_fold_pos_evaluations(padding_indicator_array,
                                                             expected_constant_term_accumulator,
                                                             mle_opening_point,
                                                             r_squares,
                                                             prover_evaluations,
                                                             expected_constant_term_accumulator);
    std::vector<Commitment> commitments;
    std::vector<Fr> scalars;

    ShpleminiVerifier::batch_gemini_claims_received_from_prover(padding_indicator_array,
                                                                prover_commitments,
                                                                prover_evaluations,
                                                                gemini_fold_pos_evaluations,
                                                                inverse_vanishing_evals,
                                                                shplonk_batching_challenge_powers,
                                                                commitments,
                                                                scalars,
                                                                expected_constant_term_accumulator);

    // Compute the group element using the output of Shplemini method
    GroupElement shplemini_result = batch_mul_native(commitments, scalars);

    EXPECT_EQ(shplemini_result, expected_result);
}

/**
 * @brief Test Shplemini with ZK data consisting of a hiding polynomial generated by GeminiProver and Libra polynomials
 * used to mask Sumcheck Round Univariates. This abstracts the PCS step in each ZK Flavor running over BN254.
 *
 */
TYPED_TEST(ShpleminiTest, ShpleminiZKNoSumcheckOpenings)
{
    using ZKData = ZKSumcheckData<TypeParam>;
    using Curve = TypeParam::Curve;
    using ShpleminiProver = ShpleminiProver_<Curve>;
    using ShpleminiVerifier = ShpleminiVerifier_<Curve>;
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using CK = typename TypeParam::CommitmentKey;

    // Initialize transcript and commitment key
    auto prover_transcript = TypeParam::Transcript::prover_init_empty();

    // SmallSubgroupIPAProver requires at least CURVE::SUBGROUP_SIZE + 3 elements in the ck.
    static constexpr size_t log_subgroup_size = static_cast<size_t>(numeric::get_msb(Curve::SUBGROUP_SIZE));
    CK ck = create_commitment_key<CK>(std::max<size_t>(this->n, 1ULL << (log_subgroup_size + 1)));

    // Generate Libra polynomials, compute masked concatenated Libra polynomial, commit to it
    ZKData zk_sumcheck_data(this->log_n, prover_transcript, ck);

    // Generate multivariate challenge of size CONST_PROOF_SIZE_LOG_N
    std::vector<Fr> mle_opening_point = this->random_evaluation_point(this->log_n);

    // Generate random prover polynomials, compute their evaluations and commitments
    MockClaimGenerator<Curve> mock_claims(this->n,
                                          /*num_polynomials*/ this->num_polynomials,
                                          /*num_to_be_shifted*/ this->num_shiftable,
                                          /*num_to_be_right_shifted_by_k*/ this->num_right_shiftable_by_k,
                                          mle_opening_point,
                                          ck);

    // Compute the sum of the Libra constant term and Libra univariates evaluated at Sumcheck challenges
    const Fr claimed_inner_product = SmallSubgroupIPAProver<TypeParam>::compute_claimed_inner_product(
        zk_sumcheck_data, mle_opening_point, this->log_n);

    prover_transcript->template send_to_verifier("Libra:claimed_evaluation", claimed_inner_product);

    // Instantiate SmallSubgroupIPAProver, this prover sends commitments to Big Sum and Quotient polynomials
    SmallSubgroupIPAProver<TypeParam> small_subgroup_ipa_prover(
        zk_sumcheck_data, mle_opening_point, claimed_inner_product, prover_transcript, ck);
    small_subgroup_ipa_prover.prove();

    // Reduce to KZG or IPA based on the curve used in the test Flavor
    const auto opening_claim = ShpleminiProver::prove(this->n,
                                                      mock_claims.polynomial_batcher,
                                                      mle_opening_point,
                                                      ck,
                                                      prover_transcript,
                                                      small_subgroup_ipa_prover.get_witness_polynomials());

    if constexpr (std::is_same_v<TypeParam, GrumpkinSettings>) {
        IPA<Curve>::compute_opening_proof(this->ck(), opening_claim, prover_transcript);
    } else {
        KZG<Curve>::compute_opening_proof(this->ck(), opening_claim, prover_transcript);
    }

    // Initialize verifier's transcript
    auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);

    // Start populating Verifier's array of Libra commitments
    std::array<Commitment, NUM_LIBRA_COMMITMENTS> libra_commitments = {};
    libra_commitments[0] =
        verifier_transcript->template receive_from_prover<Commitment>("Libra:concatenation_commitment");

    // Place Libra data to the transcript
    const Fr libra_total_sum = verifier_transcript->template receive_from_prover<Fr>("Libra:Sum");
    const Fr libra_challenge = verifier_transcript->template get_challenge<Fr>("Libra:Challenge");
    const Fr libra_evaluation = verifier_transcript->template receive_from_prover<Fr>("Libra:claimed_evaluation");

    // Check that transcript is consistent
    EXPECT_EQ(libra_total_sum, zk_sumcheck_data.libra_total_sum);
    EXPECT_EQ(libra_challenge, zk_sumcheck_data.libra_challenge);
    EXPECT_EQ(libra_evaluation, claimed_inner_product);

    // Finalize the array of Libra/SmallSubgroupIpa commitments
    libra_commitments[1] = verifier_transcript->template receive_from_prover<Commitment>("Libra:grand_sum_commitment");
    libra_commitments[2] = verifier_transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");

    // Used to verify the consistency of the evaluations of the concatenated libra polynomial, big sum polynomial, and
    // the quotient polynomial computed by SmallSubgroupIPAProver
    bool consistency_checked = true;

    // Run Shplemini
    std::vector<Fr> padding_indicator_array(this->log_n, Fr{ 1 });

    const auto batch_opening_claim = ShpleminiVerifier::compute_batch_opening_claim(padding_indicator_array,
                                                                                    mock_claims.claim_batcher,
                                                                                    mle_opening_point,
                                                                                    this->vk()->get_g1_identity(),
                                                                                    verifier_transcript,
                                                                                    {},
                                                                                    true,
                                                                                    &consistency_checked,
                                                                                    libra_commitments,
                                                                                    libra_evaluation);
    // Verify claim using KZG or IPA
    if constexpr (std::is_same_v<TypeParam, GrumpkinSettings>) {
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

/**
 * @brief Test Shplemini with ZK data consisting of a hiding polynomial generated by GeminiProver, Libra polynomials
 * used to mask Sumcheck Round Univariates and prove/verify the claimed evaluations of committed sumcheck round
 * univariates. This test abstracts the PCS step in each ZK Flavor running over Grumpkin.
 *
 */
TYPED_TEST(ShpleminiTest, ShpleminiZKWithSumcheckOpenings)
{
    using Curve = TypeParam::Curve;
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using CK = typename TypeParam::CommitmentKey;

    using ShpleminiProver = ShpleminiProver_<Curve>;
    using ShpleminiVerifier = ShpleminiVerifier_<Curve>;

    CK ck = create_commitment_key<CK>(4096);

    // Generate Sumcheck challenge
    std::vector<Fr> challenge = this->random_evaluation_point(this->log_n);

    auto prover_transcript = TypeParam::Transcript::prover_init_empty();

    // Generate masking polynomials for Sumcheck Round Univariates
    ZKSumcheckData<TypeParam> zk_sumcheck_data(this->log_n, prover_transcript, ck);
    // Generate mock witness
    MockClaimGenerator<Curve> mock_claims(this->n, 1);

    // Generate valid sumcheck polynomials of given length
    mock_claims.template compute_sumcheck_opening_data<TypeParam>(
        this->log_n, this->sumcheck_univariate_length, challenge, ck);

    // Compute the sum of the Libra constant term and Libra univariates evaluated at Sumcheck challenges
    const Fr claimed_inner_product =
        SmallSubgroupIPAProver<TypeParam>::compute_claimed_inner_product(zk_sumcheck_data, challenge, this->log_n);

    prover_transcript->template send_to_verifier("Libra:claimed_evaluation", claimed_inner_product);

    // Instantiate SmallSubgroupIPAProver, this prover sends commitments to Big Sum and Quotient polynomials
    SmallSubgroupIPAProver<TypeParam> small_subgroup_ipa_prover(
        zk_sumcheck_data, challenge, claimed_inner_product, prover_transcript, ck);
    small_subgroup_ipa_prover.prove();

    // Reduce proving to a single claimed fed to KZG or IPA
    const auto opening_claim = ShpleminiProver::prove(this->n,
                                                      mock_claims.polynomial_batcher,
                                                      challenge,
                                                      ck,
                                                      prover_transcript,
                                                      small_subgroup_ipa_prover.get_witness_polynomials(),
                                                      mock_claims.round_univariates,
                                                      mock_claims.sumcheck_evaluations);

    if constexpr (std::is_same_v<TypeParam, GrumpkinSettings>) {
        IPA<Curve>::compute_opening_proof(this->ck(), opening_claim, prover_transcript);
    } else {
        KZG<Curve>::compute_opening_proof(this->ck(), opening_claim, prover_transcript);
    }

    // Initialize verifier's transcript
    auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);

    std::array<Commitment, NUM_LIBRA_COMMITMENTS> libra_commitments = {};
    libra_commitments[0] =
        verifier_transcript->template receive_from_prover<Commitment>("Libra:concatenation_commitment");

    // Place Libra data to the transcript
    const Fr libra_total_sum = verifier_transcript->template receive_from_prover<Fr>("Libra:Sum");
    const Fr libra_challenge = verifier_transcript->template get_challenge<Fr>("Libra:Challenge");
    const Fr libra_evaluation = verifier_transcript->template receive_from_prover<Fr>("Libra:claimed_evaluation");

    // Check that transcript is consistent
    EXPECT_EQ(libra_total_sum, zk_sumcheck_data.libra_total_sum);
    EXPECT_EQ(libra_challenge, zk_sumcheck_data.libra_challenge);
    EXPECT_EQ(libra_evaluation, claimed_inner_product);

    // Finalize the array of Libra/SmallSubgroupIpa commitments
    libra_commitments[1] = verifier_transcript->template receive_from_prover<Commitment>("Libra:grand_sum_commitment");
    libra_commitments[2] = verifier_transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");

    bool consistency_checked = true;

    // Run Shplemini
    std::vector<Fr> padding_indicator_array(this->log_n, Fr{ 1 });

    const auto batch_opening_claim = ShpleminiVerifier::compute_batch_opening_claim(padding_indicator_array,
                                                                                    mock_claims.claim_batcher,
                                                                                    challenge,
                                                                                    this->vk()->get_g1_identity(),
                                                                                    verifier_transcript,
                                                                                    {},
                                                                                    true,
                                                                                    &consistency_checked,
                                                                                    libra_commitments,
                                                                                    libra_evaluation,
                                                                                    mock_claims.sumcheck_commitments,
                                                                                    mock_claims.sumcheck_evaluations);
    // Verify claim using KZG or IPA
    if constexpr (std::is_same_v<TypeParam, GrumpkinSettings>) {
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
