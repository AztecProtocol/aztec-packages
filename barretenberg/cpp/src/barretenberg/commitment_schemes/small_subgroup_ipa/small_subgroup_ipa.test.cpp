#include "barretenberg/commitment_schemes/small_subgroup_ipa/small_subgroup_ipa.hpp"
#include "../pcs_test_utils.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/commitment_schemes/utils/test_settings.hpp"

#include <array>
#include <gtest/gtest.h>
#include <vector>

namespace bb {
template <typename Flavor> class SmallSubgroupIPATest : public ::testing::Test {
  public:
    using Curve = typename Flavor::Curve;
    using Transcript = typename Flavor::Transcript;
    using FF = typename Curve::ScalarField;

    static constexpr FF subgroup_generator = Curve::subgroup_generator;

    static constexpr size_t log_circuit_size = 7;
    static constexpr size_t circuit_size = 1ULL << log_circuit_size;

    FF evaluation_challenge;

    void SetUp() override { evaluation_challenge = FF::random_element(); }

    static std::vector<FF> generate_random_vector(const size_t size)
    {
        std::vector<FF> multivariate_challenge(size);
        for (auto& challenge : multivariate_challenge) {
            challenge = FF::random_element();
        }
        return multivariate_challenge;
    }

    // A helper to evaluate the four IPA witness polynomials at x, x*g, x, x
    std::array<FF, NUM_SMALL_IPA_EVALUATIONS> evaluate_small_ipa_witnesses(
        const std::array<Polynomial<FF>, NUM_SMALL_IPA_EVALUATIONS>& witness_polynomials)
    {
        // Hard-coded pattern of evaluation: (x, x*g, x, x)
        return { witness_polynomials[0].evaluate(evaluation_challenge),
                 witness_polynomials[1].evaluate(evaluation_challenge * subgroup_generator),
                 witness_polynomials[2].evaluate(evaluation_challenge),
                 witness_polynomials[3].evaluate(evaluation_challenge) };
    }
};

using TestFlavors = ::testing::Types<BN254Settings, GrumpkinSettings>;
TYPED_TEST_SUITE(SmallSubgroupIPATest, TestFlavors);

// Check the correctness of the computation of the claimed inner product and various polynomials needed for the
// SmallSubgroupIPA.
TYPED_TEST(SmallSubgroupIPATest, ProverComputationsCorrectness)
{
    using ZKData = ZKSumcheckData<TypeParam>;
    using SmallSubgroupIPA = SmallSubgroupIPAProver<TypeParam>;
    using FF = typename TypeParam::FF;
    static constexpr size_t SUBGROUP_SIZE = TypeParam::SUBGROUP_SIZE;

    using CK = typename TypeParam::CommitmentKey;

    // SmallSubgroupIPAProver requires at least CURVE::SUBGROUP_SIZE + 3 elements in the ck.
    static constexpr size_t log_subgroup_size = static_cast<size_t>(numeric::get_msb(SUBGROUP_SIZE));
    CK ck = create_commitment_key<CK>(std::max<size_t>(this->circuit_size, 1ULL << (log_subgroup_size + 1)));

    auto prover_transcript = TypeParam::Transcript::prover_init_empty();

    ZKData zk_sumcheck_data(this->log_circuit_size, prover_transcript, ck);
    std::vector<FF> multivariate_challenge = this->generate_random_vector(this->log_circuit_size);

    const FF claimed_inner_product = SmallSubgroupIPA::compute_claimed_inner_product(
        zk_sumcheck_data, multivariate_challenge, this->log_circuit_size);

    SmallSubgroupIPA small_subgroup_ipa_prover =
        SmallSubgroupIPA(zk_sumcheck_data, multivariate_challenge, claimed_inner_product, prover_transcript, ck);

    small_subgroup_ipa_prover.prove();

    const Polynomial batched_polynomial = small_subgroup_ipa_prover.get_batched_polynomial();
    const Polynomial libra_concatenated_polynomial = small_subgroup_ipa_prover.get_witness_polynomials()[0];
    const Polynomial batched_quotient = small_subgroup_ipa_prover.get_witness_polynomials()[3];
    const Polynomial challenge_polynomial = small_subgroup_ipa_prover.get_challenge_polynomial();

    // Check that claimed inner product coincides with the inner product of libra_concatenated_polynomial and
    // challenge_polynomial. Since libra_concatenated_polynomial is masked, we also check that masking does not affect
    // the evaluations over H
    FF inner_product = FF(0);
    const std::array<FF, SUBGROUP_SIZE> domain = zk_sumcheck_data.interpolation_domain;
    for (size_t idx = 0; idx < SUBGROUP_SIZE; idx++) {
        inner_product +=
            challenge_polynomial.evaluate(domain[idx]) * libra_concatenated_polynomial.evaluate(domain[idx]);
    }
    EXPECT_TRUE(inner_product == claimed_inner_product);

    // Check that batched polynomial is divisible by Z_H(X)
    bool ipa_claim_consistency = true;
    for (size_t idx = 0; idx < SUBGROUP_SIZE; idx++) {
        ipa_claim_consistency = (batched_polynomial.evaluate(zk_sumcheck_data.interpolation_domain[idx]) == FF{ 0 }) &&
                                ipa_claim_consistency;
    }
    EXPECT_EQ(ipa_claim_consistency, true);

    // Check that Z_H(X) * Q(X) = batched_polynomial
    std::vector<FF> Z_H(SUBGROUP_SIZE + 1);
    Z_H[0] = -FF(1);
    Z_H[SUBGROUP_SIZE] = FF(1);
    Polynomial<FF> product(batched_polynomial.size());

    for (size_t i = 0; i < Z_H.size(); i++) {
        for (size_t j = 0; j < batched_quotient.size(); j++) {
            product.at(i + j) += Z_H[i] * batched_quotient.at(j);
        }
    }
    bool quotient_is_correct = true;
    for (const auto& [coeff_expected, coeff] : zip_view(product.coeffs(), batched_polynomial.coeffs())) {
        quotient_is_correct = (coeff_expected == coeff) && quotient_is_correct;
    }
    EXPECT_EQ(quotient_is_correct, true);
}

// Check the correctness of the evaluations of the challenge_polynomial, Lagrange first, and Lagrange last that the
// verifier has to compute on its own. Compare the values against the evaluations obtaned by applying Lagrange
// interpolation method used by Polynomial class constructor.
TYPED_TEST(SmallSubgroupIPATest, VerifierEvaluations)
{
    using FF = typename TypeParam::FF;
    using Curve = typename TypeParam::Curve;
    using SmallSubgroupIPA = SmallSubgroupIPAVerifier<Curve>;

    // Extract the constants
    static constexpr size_t SUBGROUP_SIZE = TypeParam::SUBGROUP_SIZE;
    const FF subgroup_generator_inverse = Curve::subgroup_generator_inverse;
    const FF subgroup_generator = subgroup_generator_inverse.invert();

    // Sample random Lagrange coefficients over H
    std::vector<FF> challenge_poly_lagrange = this->generate_random_vector(SUBGROUP_SIZE);

    // Evaluate Verifier's polynomials at the challenge
    const FF vanishing_poly_eval = this->evaluation_challenge.pow(SUBGROUP_SIZE) - 1;

    // Compute required evaluations using efficient batch evaluation
    const auto [challenge_poly_eval, lagrange_first, lagrange_last] =
        SmallSubgroupIPA::compute_batched_barycentric_evaluations(
            challenge_poly_lagrange, this->evaluation_challenge, vanishing_poly_eval);

    // Compute the evaluations differently, namely, using Lagrange interpolation
    std::array<FF, SUBGROUP_SIZE> interpolation_domain;
    interpolation_domain[0] = FF(1);
    for (size_t idx = 1; idx < SUBGROUP_SIZE; idx++) {
        interpolation_domain[idx] = interpolation_domain[idx - 1] * subgroup_generator;
    }
    Polynomial<FF> challenge_poly_monomial =
        Polynomial<FF>(interpolation_domain, challenge_poly_lagrange, SUBGROUP_SIZE);

    // Evaluate at the challenge
    const FF challenge_poly_expected_eval = challenge_poly_monomial.evaluate(this->evaluation_challenge);

    EXPECT_EQ(challenge_poly_eval, challenge_poly_expected_eval);

    // Compute Lagrange polynomials using interpolation
    std::vector<FF> lagrange_poly(SUBGROUP_SIZE);
    lagrange_poly.at(0) = FF(1);
    Polynomial<FF> lagrange_first_monomial = Polynomial<FF>(interpolation_domain, lagrange_poly, SUBGROUP_SIZE);
    EXPECT_EQ(lagrange_first, lagrange_first_monomial.evaluate(this->evaluation_challenge));

    lagrange_poly.at(0) = FF(0);
    lagrange_poly.at(SUBGROUP_SIZE - 1) = FF(1);
    Polynomial<FF> lagrange_last_monomial = Polynomial<FF>(interpolation_domain, lagrange_poly, SUBGROUP_SIZE);
    EXPECT_EQ(lagrange_last, lagrange_last_monomial.evaluate(this->evaluation_challenge));
}

// Simulate the interaction between the prover and the verifier leading to the consistency check performed by the
// verifier.
TYPED_TEST(SmallSubgroupIPATest, LibraEvaluationsConsistency)
{
    using FF = typename TypeParam::FF;
    using Curve = typename TypeParam::Curve;
    using Verifier = SmallSubgroupIPAVerifier<Curve>;
    using Prover = SmallSubgroupIPAProver<TypeParam>;
    using ZKData = ZKSumcheckData<TypeParam>;
    using CK = typename TypeParam::CommitmentKey;

    auto prover_transcript = TypeParam::Transcript::prover_init_empty();

    // SmallSubgroupIPAProver requires at least CURVE::SUBGROUP_SIZE + 3 elements in the ck.
    static constexpr size_t log_subgroup_size = static_cast<size_t>(numeric::get_msb(Curve::SUBGROUP_SIZE));
    CK ck = create_commitment_key<CK>(std::max<size_t>(this->circuit_size, 1ULL << (log_subgroup_size + 1)));

    ZKData zk_sumcheck_data(this->log_circuit_size, prover_transcript, ck);

    std::vector<FF> multivariate_challenge = this->generate_random_vector(CONST_PROOF_SIZE_LOG_N);

    const FF claimed_inner_product =
        Prover::compute_claimed_inner_product(zk_sumcheck_data, multivariate_challenge, this->log_circuit_size);

    Prover small_subgroup_ipa_prover =
        Prover(zk_sumcheck_data, multivariate_challenge, claimed_inner_product, prover_transcript, ck);

    small_subgroup_ipa_prover.prove();

    const std::array<FF, NUM_SMALL_IPA_EVALUATIONS> small_ipa_evaluations =
        this->evaluate_small_ipa_witnesses(small_subgroup_ipa_prover.get_witness_polynomials());

    bool consistency_checked = Verifier::check_libra_evaluations_consistency(
        small_ipa_evaluations, this->evaluation_challenge, multivariate_challenge, claimed_inner_product);

    EXPECT_TRUE(consistency_checked);
}

// Check that consistency check fails when some of the prover's data is corrupted.
TYPED_TEST(SmallSubgroupIPATest, LibraEvaluationsConsistencyFailure)
{
    using FF = typename TypeParam::FF;
    using Curve = typename TypeParam::Curve;
    using Verifier = SmallSubgroupIPAVerifier<Curve>;
    using Prover = SmallSubgroupIPAProver<TypeParam>;
    using ZKData = ZKSumcheckData<TypeParam>;
    using CK = typename TypeParam::CommitmentKey;

    auto prover_transcript = TypeParam::Transcript::prover_init_empty();

    // SmallSubgroupIPAProver requires at least CURVE::SUBGROUP_SIZE + 3 elements in the ck.
    static constexpr size_t log_subgroup_size = static_cast<size_t>(numeric::get_msb(Curve::SUBGROUP_SIZE));
    CK ck = create_commitment_key<CK>(std::max<size_t>(this->circuit_size, 1ULL << (log_subgroup_size + 1)));

    ZKData zk_sumcheck_data(this->log_circuit_size, prover_transcript, ck);

    std::vector<FF> multivariate_challenge = this->generate_random_vector(CONST_PROOF_SIZE_LOG_N);

    const FF claimed_inner_product =
        Prover::compute_claimed_inner_product(zk_sumcheck_data, multivariate_challenge, this->log_circuit_size);

    Prover small_subgroup_ipa_prover =
        Prover(zk_sumcheck_data, multivariate_challenge, claimed_inner_product, prover_transcript, ck);

    small_subgroup_ipa_prover.prove();

    std::array<Polynomial<FF>, NUM_SMALL_IPA_EVALUATIONS> witness_polynomials =
        small_subgroup_ipa_prover.get_witness_polynomials();

    // Tamper with witness polynomials
    witness_polynomials[0].at(0) = FF::random_element();

    const std::array<FF, NUM_SMALL_IPA_EVALUATIONS> small_ipa_evaluations =
        this->evaluate_small_ipa_witnesses(witness_polynomials);

    bool consistency_checked = Verifier::check_libra_evaluations_consistency(
        small_ipa_evaluations, this->evaluation_challenge, multivariate_challenge, claimed_inner_product);

    // Since witness polynomials were modified, the consistency check must fail
    EXPECT_FALSE(consistency_checked);
}

// Simulate the interaction between the prover and the verifier leading to the consistency check performed by the
// verifier.
TYPED_TEST(SmallSubgroupIPATest, TranslationMaskingTermConsistency)
{
    // TranslationData class is Grumpkin-specific
    if constexpr (std::is_same_v<TypeParam, BN254Settings>) {
        GTEST_SKIP();
    } else {
        using Curve = typename TypeParam::Curve;
        using FF = typename Curve::ScalarField;
        using Verifier = SmallSubgroupIPAVerifier<Curve>;
        using Prover = SmallSubgroupIPAProver<TypeParam>;
        using CK = typename TypeParam::CommitmentKey;

        auto prover_transcript = TypeParam::Transcript::prover_init_empty();
        // Must satisfy num_wires * NUM_DISABLED_ROWS_IN_SUMCHECK + 1 < SUBGROUP_SIZE
        const size_t num_wires = 5;

        // SmallSubgroupIPAProver requires at least CURVE::SUBGROUP_SIZE + 3 elements in the ck.
        static constexpr size_t log_subgroup_size = static_cast<size_t>(numeric::get_msb(Curve::SUBGROUP_SIZE));
        CK ck = create_commitment_key<CK>(std::max<size_t>(this->circuit_size, 1ULL << (log_subgroup_size + 1)));

        // Generate transcript polynomials
        std::vector<Polynomial<FF>> transcript_polynomials;

        for (size_t idx = 0; idx < num_wires; idx++) {
            transcript_polynomials.push_back(Polynomial<FF>::random(this->circuit_size));
        }

        TranslationData<typename TypeParam::Transcript> translation_data(
            RefVector<Polynomial<FF>>(transcript_polynomials), prover_transcript, ck);

        const FF evaluation_challenge_x = FF::random_element();
        const FF batching_challenge_v = FF::random_element();

        Prover small_subgroup_ipa_prover(
            translation_data, evaluation_challenge_x, batching_challenge_v, prover_transcript, ck);
        small_subgroup_ipa_prover.prove();

        const std::array<FF, NUM_SMALL_IPA_EVALUATIONS> small_ipa_evaluations =
            this->evaluate_small_ipa_witnesses(small_subgroup_ipa_prover.get_witness_polynomials());

        bool consistency_checked =
            Verifier::check_eccvm_evaluations_consistency(small_ipa_evaluations,
                                                          this->evaluation_challenge,
                                                          evaluation_challenge_x,
                                                          batching_challenge_v,
                                                          small_subgroup_ipa_prover.claimed_inner_product);

        EXPECT_TRUE(consistency_checked);
    }
};
// Simulate the interaction between the prover and the verifier leading to the consistency check performed by the
// verifier.
TYPED_TEST(SmallSubgroupIPATest, TranslationMaskingTermConsistencyFailure)
{
    // TranslationData class is Grumpkin-specific
    if constexpr (std::is_same_v<TypeParam, BN254Settings>) {
        GTEST_SKIP();
    } else {
        using Curve = typename TypeParam::Curve;
        using FF = typename Curve::ScalarField;
        using Verifier = SmallSubgroupIPAVerifier<Curve>;
        using Prover = SmallSubgroupIPAProver<TypeParam>;
        using CK = typename TypeParam::CommitmentKey;

        auto prover_transcript = TypeParam::Transcript::prover_init_empty();
        // Must satisfy num_wires * NUM_DISABLED_ROWS_IN_SUMCHECK + 1 < SUBGROUP_SIZE
        const size_t num_wires = 5;

        // SmallSubgroupIPAProver requires at least CURVE::SUBGROUP_SIZE + 3 elements in the ck.
        static constexpr size_t log_subgroup_size = static_cast<size_t>(numeric::get_msb(Curve::SUBGROUP_SIZE));
        CK ck = create_commitment_key<CK>(std::max<size_t>(this->circuit_size, 1ULL << (log_subgroup_size + 1)));

        // Generate transcript polynomials
        std::vector<Polynomial<FF>> transcript_polynomials;

        for (size_t idx = 0; idx < num_wires; idx++) {
            transcript_polynomials.push_back(Polynomial<FF>::random(this->circuit_size));
        }

        TranslationData<typename TypeParam::Transcript> translation_data(
            RefVector<Polynomial<FF>>(transcript_polynomials), prover_transcript, ck);

        const FF evaluation_challenge_x = FF::random_element();
        const FF batching_challenge_v = FF::random_element();

        Prover small_subgroup_ipa_prover(
            translation_data, evaluation_challenge_x, batching_challenge_v, prover_transcript, ck);
        small_subgroup_ipa_prover.prove();

        const std::array<FF, NUM_SMALL_IPA_EVALUATIONS> small_ipa_evaluations =
            this->evaluate_small_ipa_witnesses(small_subgroup_ipa_prover.get_witness_polynomials());

        bool consistency_checked =
            Verifier::check_eccvm_evaluations_consistency(small_ipa_evaluations,
                                                          this->evaluation_challenge,
                                                          evaluation_challenge_x,
                                                          batching_challenge_v,
                                                          /*tampered claimed inner product = */ FF::random_element());

        EXPECT_TRUE(!consistency_checked);
    }
}

// Test that verification aborts when the evaluation challenge is in the small subgroup.
// This is an edge case that should never happen in practice (probability ~1/|H|), but
// if it does, the protocol must reject to prevent soundness issues.
TYPED_TEST(SmallSubgroupIPATest, EvaluationChallengeInSubgroupThrows)
{
    using FF = typename TypeParam::FF;
    using Curve = typename TypeParam::Curve;
    using Verifier = SmallSubgroupIPAVerifier<Curve>;

    static constexpr size_t SUBGROUP_SIZE = TypeParam::SUBGROUP_SIZE;

    // Create an evaluation challenge that is IN the small subgroup
    // Using g^k for some k gives us an element where Z_H(g^k) = (g^k)^|H| - 1 = g^{k*|H|} - 1 = 1 - 1 = 0
    // pick a random exponent k in the size of the subgroup
    const FF subgroup_element = Curve::subgroup_generator.pow(10); // g^10 is in the subgroup

    // Verify that Z_H(subgroup_element) = 0
    const FF vanishing_poly_eval = subgroup_element.pow(SUBGROUP_SIZE) - FF(1);
    EXPECT_EQ(vanishing_poly_eval, FF(0));

    // Create dummy evaluations - the actual values don't matter since we expect an abort
    std::array<FF, NUM_SMALL_IPA_EVALUATIONS> dummy_evaluations = {
        FF::random_element(), FF::random_element(), FF::random_element(), FF::random_element()
    };

    std::vector<FF> multivariate_challenge = this->generate_random_vector(CONST_PROOF_SIZE_LOG_N);
    FF dummy_inner_product = FF::random_element();

    // The check should throw/abort because the evaluation challenge is in the subgroup
    EXPECT_THROW(Verifier::check_libra_evaluations_consistency(
                     dummy_evaluations, subgroup_element, multivariate_challenge, dummy_inner_product),
                 std::runtime_error);
}
} // namespace bb
