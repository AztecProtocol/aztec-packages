
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
    static constexpr size_t log_n = 5;
    static constexpr size_t n = 1UL << log_n;
    // Total number of random polynomials in each test
    static constexpr size_t num_polynomials = 5;
    // Number of shiftable polynomials
    static constexpr size_t num_shiftable = 2;

    // The length of the mock sumcheck univariates.
    static constexpr size_t sumcheck_univariate_length = 24;

    using Fr = typename Flavor::Curve::ScalarField;
    using GroupElement = typename Flavor::Curve::Element;
    using Commitment = typename Flavor::Curve::AffineElement;
    // using CK = typename Flavor::CommitmentKey;

    using CK = typename Flavor::CommitmentKey;
    using VK = typename Flavor::VerifierCommitmentKey;

    static std::shared_ptr<CK> ck;
    static std::shared_ptr<VK> vk;

    static void SetUpTestSuite()
    {
        ck = create_commitment_key<CK>(4096);
        vk = create_verifier_commitment_key<VK>();
    }

    void compute_sumcheck_opening_data(std::vector<bb::Polynomial<Fr>>& round_univariates,
                                       std::vector<Commitment>& sumcheck_commitments,
                                       std::vector<std::array<Fr, 3>>& sumcheck_evaluations,
                                       std::vector<Fr>& challenge,
                                       std::shared_ptr<CK>& ck)
    {
        // Generate valid sumcheck polynomials of given length
        auto mock_sumcheck_polynomials = ZKSumcheckData<Flavor>(log_n, sumcheck_univariate_length);
        for (size_t idx = 0; idx < log_n; idx++) {
            bb::Polynomial<Fr> round_univariate = mock_sumcheck_polynomials.libra_univariates[idx];

            round_univariate.at(0) += mock_sumcheck_polynomials.libra_running_sum;

            sumcheck_commitments.push_back(ck->commit(round_univariate));

            sumcheck_evaluations.push_back({ round_univariate.at(0),
                                             round_univariate.evaluate(Fr(1)),
                                             round_univariate.evaluate(challenge[idx]) });

            mock_sumcheck_polynomials.update_zk_sumcheck_data(challenge[idx], idx);
            round_univariates.push_back(round_univariate);
        }

        // Simulate the `const proof size` logic
        auto round_univariate = bb::Polynomial<Fr>(this->n);
        for (size_t idx = this->log_n; idx < CONST_PROOF_SIZE_LOG_N; idx++) {
            round_univariates.push_back(round_univariate);
            sumcheck_commitments.push_back(ck->commit(round_univariate));
            sumcheck_evaluations.push_back({ Fr(0), Fr(0), Fr(0) });
        }
    }
};

using TestSettings = ::testing::Types<BN254Settings, GrumpkinSettings>;

TYPED_TEST_SUITE(ShpleminiTest, TestSettings);

// This test checks that batch_multivariate_opening_claims method operates correctly
TYPED_TEST(ShpleminiTest, CorrectnessOfMultivariateClaimBatching)
{
    using Curve = typename TypeParam::Curve;
    using ShpleminiVerifier = ShpleminiVerifier_<Curve>;
    using Fr = typename Curve::ScalarField;
    using GroupElement = typename Curve::Element;
    using Commitment = typename Curve::AffineElement;

    // Generate mock challenges
    Fr rho = Fr::random_element();
    Fr gemini_eval_challenge = Fr::random_element();
    Fr shplonk_batching_challenge = Fr::random_element();
    Fr shplonk_eval_challenge = Fr::random_element();

    // Generate multilinear polynomials and compute their commitments
    auto mle_opening_point = this->random_evaluation_point(this->log_n);

    auto pcs_instance_witness =
        MockWitnessGenerator<Curve>(this->n, this->num_polynomials, this->num_shiftable, mle_opening_point, this->ck);

    // Collect multilinear evaluations
    std::vector<Fr> rhos = gemini::powers_of_rho(rho, this->num_polynomials + this->num_shiftable);

    // Compute batched multivariate evaluation
    Fr batched_evaluation = Fr(0);
    size_t idx = 0;
    for (auto& eval : pcs_instance_witness.unshifted_evals) {
        batched_evaluation += eval * rhos[idx];
        idx++;
    }

    for (auto& eval : pcs_instance_witness.shifted_evals) {
        batched_evaluation += eval * rhos[idx];
        idx++;
    }

    // Compute batched commitments manually
    idx = 0;
    GroupElement batched_commitment_unshifted = GroupElement::zero();
    for (auto& comm : pcs_instance_witness.unshifted_commitments) {
        batched_commitment_unshifted += comm * rhos[idx];
        idx++;
    }

    GroupElement batched_commitment_to_be_shifted = GroupElement::zero();
    for (auto& comm : pcs_instance_witness.to_be_shifted_commitments) {
        batched_commitment_to_be_shifted += comm * rhos[idx];
        idx++;
    }

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

    Fr inverted_vanishing_eval_pos = (shplonk_eval_challenge - gemini_eval_challenge).invert();
    Fr inverted_vanishing_eval_neg = (shplonk_eval_challenge + gemini_eval_challenge).invert();

    pcs_instance_witness.claim_batcher.compute_scalars_for_each_batch(
        inverted_vanishing_eval_pos, inverted_vanishing_eval_neg, shplonk_batching_challenge, gemini_eval_challenge);

    ShpleminiVerifier::batch_multivariate_opening_claims(
        pcs_instance_witness.claim_batcher, rho, commitments, scalars, verifier_batched_evaluation);

    // Final pairing check
    GroupElement shplemini_result = batch_mul_native(commitments, scalars);

    EXPECT_EQ(commitments.size(),
              pcs_instance_witness.unshifted_commitments.size() +
                  pcs_instance_witness.to_be_shifted_commitments.size());
    EXPECT_EQ(batched_evaluation, verifier_batched_evaluation);
    EXPECT_EQ(-expected_result, shplemini_result);
}
TYPED_TEST(ShpleminiTest, CorrectnessOfGeminiClaimBatching)
{
    using Curve = TypeParam::Curve;
    using GeminiProver = GeminiProver_<Curve>;
    using PolynomialBatcher = GeminiProver::PolynomialBatcher;
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

    std::vector<Fr> mle_opening_point = this->random_evaluation_point(this->log_n);

    auto pcs_instance_witness =
        MockWitnessGenerator<Curve>(this->n, this->num_polynomials, this->num_shiftable, mle_opening_point, this->ck);

    // Collect multilinear evaluations
    std::vector<Fr> rhos = gemini::powers_of_rho(rho, this->num_polynomials + this->num_shiftable);

    PolynomialBatcher polynomial_batcher(this->n);
    polynomial_batcher.set_unshifted(RefVector(pcs_instance_witness.unshifted_polynomials));
    polynomial_batcher.set_to_be_shifted_by_one(RefVector(pcs_instance_witness.to_be_shifted_polynomials));

    Fr running_scalar = Fr(1);
    Polynomial batched = polynomial_batcher.compute_batched(rho, running_scalar);

    // Compute:
    // - (d+1) opening pairs: {r, \hat{a}_0}, {-r^{2^i}, a_i}, i = 0, ..., d-1
    // - (d+1) Fold polynomials Fold_{r}^(0), Fold_{-r}^(0), and Fold^(i), i = 0, ..., d-1
    auto fold_polynomials = GeminiProver::compute_fold_polynomials(this->log_n, mle_opening_point, batched);

    std::vector<Commitment> prover_commitments;
    for (size_t l = 0; l < this->log_n - 1; ++l) {
        auto commitment = this->ck->commit(fold_polynomials[l]);
        prover_commitments.emplace_back(commitment);
    }

    auto [A_0_pos, A_0_neg] = GeminiProver::compute_partially_evaluated_batch_polynomials(
        this->log_n, polynomial_batcher, gemini_eval_challenge);

    const auto opening_claims = GeminiProver::construct_univariate_opening_claims(
        this->log_n, std::move(A_0_pos), std::move(A_0_neg), std::move(fold_polynomials), gemini_eval_challenge);

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
    for (size_t idx = 1; idx < this->log_n + 1; idx++) {
        expected_inverse_vanishing_evals[idx] = (shplonk_eval_challenge + r_squares[idx - 1]).invert();
    }

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
    using PolynomialBatcher = GeminiProver_<Curve>::PolynomialBatcher;

    // Initialize transcript and commitment key
    auto prover_transcript = TypeParam::Transcript::prover_init_empty();

    // SmallSubgroupIPAProver requires at least CURVE::SUBGROUP_SIZE + 3 elements in the ck.
    // static constexpr size_t log_subgroup_size = static_cast<size_t>(numeric::get_msb(Curve::SUBGROUP_SIZE));
    // std::shared_ptr<CK> ck = create_commitment_key<CK>(std::max<size_t>(this->n, 1ULL << (log_subgroup_size + 1)));

    // Generate Libra polynomials, compute masked concatenated Libra polynomial, commit to it
    ZKData zk_sumcheck_data(this->log_n, prover_transcript, this->ck);

    // Generate multivariate challenge of size CONST_PROOF_SIZE_LOG_N
    std::vector<Fr> const_size_mle_opening_point = this->random_evaluation_point(CONST_PROOF_SIZE_LOG_N);
    // Truncate the multivariate challenge to evaluate prover polynomials (As in Sumcheck)
    const std::vector<Fr> mle_opening_point(const_size_mle_opening_point.begin(),
                                            const_size_mle_opening_point.begin() + this->log_n);

    // Generate random prover polynomials, compute their evaluations and commitments
    MockWitnessGenerator<Curve> pcs_instance_witness(
        this->n, this->num_polynomials, this->num_shiftable, mle_opening_point, this->ck);

    // Compute the sum of the Libra constant term and Libra univariates evaluated at Sumcheck challenges
    const Fr claimed_inner_product = SmallSubgroupIPAProver<TypeParam>::compute_claimed_inner_product(
        zk_sumcheck_data, const_size_mle_opening_point, this->log_n);

    prover_transcript->template send_to_verifier("Libra:claimed_evaluation", claimed_inner_product);

    // Instantiate SmallSubgroupIPAProver, this prover sends commitments to Big Sum and Quotient polynomials
    SmallSubgroupIPAProver<TypeParam> small_subgroup_ipa_prover(
        zk_sumcheck_data, const_size_mle_opening_point, claimed_inner_product, prover_transcript, this->ck);

    PolynomialBatcher polynomial_batcher(this->n);
    polynomial_batcher.set_unshifted(RefVector(pcs_instance_witness.unshifted_polynomials));
    polynomial_batcher.set_to_be_shifted_by_one(RefVector(pcs_instance_witness.to_be_shifted_polynomials));

    // Reduce to KZG or IPA based on the curve used in the test Flavor
    const auto opening_claim = ShpleminiProver::prove(this->n,
                                                      polynomial_batcher,
                                                      const_size_mle_opening_point,
                                                      this->ck,
                                                      prover_transcript,
                                                      small_subgroup_ipa_prover.get_witness_polynomials());

    if constexpr (std::is_same_v<TypeParam, GrumpkinSettings>) {
        IPA<Curve>::compute_opening_proof(this->ck, opening_claim, prover_transcript);
    } else {
        KZG<Curve>::compute_opening_proof(this->ck, opening_claim, prover_transcript);
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
    libra_commitments[1] = verifier_transcript->template receive_from_prover<Commitment>("Libra:big_sum_commitment");
    libra_commitments[2] = verifier_transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");

    // Used to verify the consistency of the evaluations of the concatenated libra polynomial, big sum polynomial, and
    // the quotient polynomial computed by SmallSubgroupIPAProver
    bool consistency_checked = true;

    // Run Shplemini
    const auto batch_opening_claim = ShpleminiVerifier::compute_batch_opening_claim(this->n,
                                                                                    pcs_instance_witness.claim_batcher,
                                                                                    const_size_mle_opening_point,
                                                                                    this->vk->get_g1_identity(),
                                                                                    verifier_transcript,
                                                                                    {},
                                                                                    true,
                                                                                    &consistency_checked,
                                                                                    libra_commitments,
                                                                                    libra_evaluation);
    // Verify claim using KZG or IPA
    if constexpr (std::is_same_v<TypeParam, GrumpkinSettings>) {
        auto result = IPA<Curve>::reduce_verify_batch_opening_claim(batch_opening_claim, this->vk, verifier_transcript);
        EXPECT_EQ(result, true);
    } else {
        const auto pairing_points =
            KZG<Curve>::reduce_verify_batch_opening_claim(batch_opening_claim, verifier_transcript);
        // Final pairing check: e([Q] - [Q_z] + z[W], [1]_2) = e([W], [x]_2)
        EXPECT_EQ(this->vk->pairing_check(pairing_points[0], pairing_points[1]), true);
    }
}

TYPED_TEST(ShpleminiTest, MultiShplemini)
{
    using Curve = TypeParam::Curve;
    using ShpleminiProver = ShpleminiProver_<Curve>;
    using ShpleminiVerifier = ShpleminiVerifier_<Curve>;
    using Fr = typename Curve::ScalarField;

    // Initialize transcript and commitment key
    auto prover_transcript = TypeParam::Transcript::prover_init_empty();

    //
    static constexpr size_t num_polys_in_group = 16;

    // Generate multivariate challenge of size CONST_PROOF_SIZE_LOG_N
    std::vector<Fr> const_size_mle_opening_point = this->random_evaluation_point(CONST_PROOF_SIZE_LOG_N);
    // Truncate the multivariate challenge to evaluate prover polynomials (As in Sumcheck)
    std::vector<Fr> mle_opening_point(const_size_mle_opening_point.begin(),
                                      const_size_mle_opening_point.begin() + this->log_n);

    // Thanks to const proof size, we could simply re-use some of dummy challenges for the opening of the concatenation.
    std::vector<Fr> extra_challenges(4);

    // Get  4 = log(16) extra challenges
    for (size_t idx = 0; idx < 4; idx++) {
        extra_challenges[idx] = const_size_mle_opening_point[idx + this->log_n];
    }

    // Generate random prover polynomials, compute their evaluations and commitments
    // 64 = number of short unshifted polynomials, they are be concatenated into 4 polys
    // 16 = number of short to-be-shifted polynomials, they are concatenated into a single poly

    MultiWitnessGenerator<Curve> pcs_instance_witness(
        num_polys_in_group, this->n, 64, 16, mle_opening_point, extra_challenges);

    // The interface here is unchanged
    const auto opening_claim = ShpleminiProver::prove(this->n * num_polys_in_group,
                                                      pcs_instance_witness.polynomial_batcher,
                                                      const_size_mle_opening_point,
                                                      this->ck,
                                                      prover_transcript);

    if constexpr (std::is_same_v<TypeParam, GrumpkinSettings>) {
        IPA<Curve>::compute_opening_proof(this->ck, opening_claim, prover_transcript);
    } else {
        KZG<Curve>::compute_opening_proof(this->ck, opening_claim, prover_transcript);
    }

    // Initialize verifier's transcript
    auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);

    // Run Shplemini
    const auto batch_opening_claim = ShpleminiVerifier::compute_batch_opening_claim(this->n * num_polys_in_group,
                                                                                    pcs_instance_witness.claim_batcher,
                                                                                    const_size_mle_opening_point,
                                                                                    this->vk->get_g1_identity(),
                                                                                    verifier_transcript);
    // Verify claim using KZG or IPA
    if constexpr (std::is_same_v<TypeParam, GrumpkinSettings>) {
        auto result = IPA<Curve>::reduce_verify_batch_opening_claim(batch_opening_claim, this->vk, verifier_transcript);
        EXPECT_EQ(result, true);
    } else {
        const auto pairing_points =
            KZG<Curve>::reduce_verify_batch_opening_claim(batch_opening_claim, verifier_transcript);
        // Final pairing check: e([Q] - [Q_z] + z[W], [1]_2) = e([W], [x]_2)
        EXPECT_EQ(this->vk->pairing_check(pairing_points[0], pairing_points[1]), true);
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

    using ShpleminiProver = ShpleminiProver_<Curve>;
    using ShpleminiVerifier = ShpleminiVerifier_<Curve>;
    using PolynomialBatcher = GeminiProver_<Curve>::PolynomialBatcher;

    // Generate Sumcheck challenge, current implementation of Sumcheck Round Univariates batching in Shplemini assumes
    // that the challenge is of CONST_PROOF_SIZE_LOG_N
    std::vector<Fr> challenge = this->random_evaluation_point(CONST_PROOF_SIZE_LOG_N);

    auto prover_transcript = TypeParam::Transcript::prover_init_empty();

    // Generate masking polynomials for Sumcheck Round Univariates
    ZKSumcheckData<TypeParam> zk_sumcheck_data(this->log_n, prover_transcript, this->ck);
    // Generate mock witness
    MockWitnessGenerator<Curve> pcs_instance_witness(this->n, 1);

    // Generate valid sumcheck polynomials of given length
    pcs_instance_witness.template compute_sumcheck_opening_data<TypeParam>(
        this->n, this->log_n, this->sumcheck_univariate_length, challenge, this->ck);

    // Compute the sum of the Libra constant term and Libra univariates evaluated at Sumcheck challenges
    const Fr claimed_inner_product =
        SmallSubgroupIPAProver<TypeParam>::compute_claimed_inner_product(zk_sumcheck_data, challenge, this->log_n);

    prover_transcript->template send_to_verifier("Libra:claimed_evaluation", claimed_inner_product);

    // Instantiate SmallSubgroupIPAProver, this prover sends commitments to Big Sum and Quotient polynomials
    SmallSubgroupIPAProver<TypeParam> small_subgroup_ipa_prover(
        zk_sumcheck_data, challenge, claimed_inner_product, prover_transcript, this->ck);

    PolynomialBatcher polynomial_batcher(this->n);
    polynomial_batcher.set_unshifted(RefVector(pcs_instance_witness.unshifted_polynomials));
    polynomial_batcher.set_to_be_shifted_by_one(RefVector(pcs_instance_witness.to_be_shifted_polynomials));

    // Reduce proving to a single claimed fed to KZG or IPA
    const auto opening_claim = ShpleminiProver::prove(this->n,
                                                      polynomial_batcher,
                                                      challenge,
                                                      this->ck,
                                                      prover_transcript,
                                                      small_subgroup_ipa_prover.get_witness_polynomials(),
                                                      pcs_instance_witness.round_univariates,
                                                      pcs_instance_witness.sumcheck_evaluations);

    if constexpr (std::is_same_v<TypeParam, GrumpkinSettings>) {
        IPA<Curve>::compute_opening_proof(this->ck, opening_claim, prover_transcript);
    } else {
        KZG<Curve>::compute_opening_proof(this->ck, opening_claim, prover_transcript);
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
    libra_commitments[1] = verifier_transcript->template receive_from_prover<Commitment>("Libra:big_sum_commitment");
    libra_commitments[2] = verifier_transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");

    bool consistency_checked = true;

    // Run Shplemini
    const auto batch_opening_claim =
        ShpleminiVerifier::compute_batch_opening_claim(this->n,
                                                       pcs_instance_witness.claim_batcher,
                                                       challenge,
                                                       this->vk->get_g1_identity(),
                                                       verifier_transcript,
                                                       {},
                                                       true,
                                                       &consistency_checked,
                                                       libra_commitments,
                                                       libra_evaluation,
                                                       pcs_instance_witness.sumcheck_commitments,
                                                       pcs_instance_witness.sumcheck_evaluations);
    // Verify claim using KZG or IPA
    if constexpr (std::is_same_v<TypeParam, GrumpkinSettings>) {
        auto result = IPA<Curve>::reduce_verify_batch_opening_claim(batch_opening_claim, this->vk, verifier_transcript);
        EXPECT_EQ(result, true);
    } else {
        const auto pairing_points =
            KZG<Curve>::reduce_verify_batch_opening_claim(batch_opening_claim, verifier_transcript);
        // Final pairing check: e([Q] - [Q_z] + z[W], [1]_2) = e([W], [x]_2)
        EXPECT_EQ(this->vk->pairing_check(pairing_points[0], pairing_points[1]), true);
    }
}
} // namespace bb

template <class Flavor> std::shared_ptr<typename bb::ShpleminiTest<Flavor>::CK> bb::ShpleminiTest<Flavor>::ck = nullptr;
template <class Flavor> std::shared_ptr<typename bb::ShpleminiTest<Flavor>::VK> bb::ShpleminiTest<Flavor>::vk = nullptr;