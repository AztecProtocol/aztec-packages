#include "barretenberg/commitment_schemes/small_subgroup_ipa/small_subgroup_ipa.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/commitment_schemes/test_flavors.hpp"

#include <array>
#include <vector>

namespace bb {
template <typename Flavor> class SmallSubgroupIPATest : public ::testing::Test {
  public:
    using Curve = typename Flavor::Curve;
    using CommitmentKey = typename Flavor::CommitmentKey;
    using Transcript = typename Flavor::Transcript;
    using FF = typename Curve::ScalarField;

    static constexpr size_t log_circuit_size = 7;

    FF evaluation_challenge;

    void SetUp() override { evaluation_challenge = FF::random_element(); }

    static FF compute_claimed_inner_product(ZKSumcheckData<Flavor>& zk_sumcheck_data,
                                            const std::vector<FF>& multivariate_challenge,
                                            const size_t& log_circuit_size)
    {
        const FF libra_challenge_inv = zk_sumcheck_data.libra_challenge.invert();
        // Compute claimed inner product similarly to the SumcheckProver
        FF claimed_inner_product = FF{ 0 };
        size_t idx = 0;
        for (const auto& univariate : zk_sumcheck_data.libra_univariates) {
            claimed_inner_product += univariate.evaluate(multivariate_challenge[idx]);
            idx++;
        }
        // Libra Univariates are mutiplied by the Libra challenge in setup_auxiliary_data(), needs to be undone
        claimed_inner_product *= libra_challenge_inv / FF(1 << (log_circuit_size - 1));
        claimed_inner_product += zk_sumcheck_data.constant_term;
        return claimed_inner_product;
    }

    static std::vector<FF> generate_random_vector(const size_t size)
    {
        std::vector<FF> multivariate_challenge(size);
        for (auto& challenge : multivariate_challenge) {
            challenge = FF::random_element();
        }
        return multivariate_challenge;
    }
};

// Register the flavors for the test suite
using TestFlavors = ::testing::Types<TestBn254Flavor, TestGrumpkinFlavor>;
TYPED_TEST_SUITE(SmallSubgroupIPATest, TestFlavors);

// Implement the tests
TYPED_TEST(SmallSubgroupIPATest, ProverComputationsCorrectness)
{
    using ZKData = ZKSumcheckData<TypeParam>;
    using SmallSubgroupIPA = SmallSubgroupIPAProver<TypeParam>;
    using FF = typename TypeParam::FF;
    static constexpr size_t SUBGROUP_SIZE = TypeParam::SUBGROUP_SIZE;

    std::shared_ptr<typename TypeParam::CommitmentKey> ck;

    auto prover_transcript = TypeParam::Transcript::prover_init_empty();
    ck = CreateCommitmentKey<typename TypeParam::CommitmentKey>();

    ZKData zk_sumcheck_data(this->log_circuit_size, prover_transcript, ck);
    std::vector<FF> multivariate_challenge = this->generate_random_vector(this->log_circuit_size);

    const FF claimed_inner_product =
        this->compute_claimed_inner_product(zk_sumcheck_data, multivariate_challenge, this->log_circuit_size);

    SmallSubgroupIPA small_subgroup_ipa_prover =
        SmallSubgroupIPA(zk_sumcheck_data, multivariate_challenge, claimed_inner_product, prover_transcript, ck);

    auto batched_polynomial = small_subgroup_ipa_prover.get_batched_polynomial();
    auto libra_concatenated_polynomial = small_subgroup_ipa_prover.get_witness_polynomials()[0];
    auto batched_quotient = small_subgroup_ipa_prover.get_witness_polynomials()[3];
    auto challenge_polynomial = small_subgroup_ipa_prover.get_challenge_polynomial();

    // Check that claimed inner product coincides with the inner product of libra_concatenated_polynomial and
    // challenge_polynomial Since libra_concatenated_polynomial is masked, we also check that masking does not affect
    // the evaluations over H
    FF inner_product = FF(0);
    auto domain = zk_sumcheck_data.interpolation_domain;
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
            challenge_poly_lagrange, this->evaluation_challenge, subgroup_generator_inverse, vanishing_poly_eval);

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

TYPED_TEST(SmallSubgroupIPATest, ProverAndVerifierSimple)
{
    using FF = typename TypeParam::FF;
    using Curve = typename TypeParam::Curve;
    using Verifier = SmallSubgroupIPAVerifier<Curve>;
    using Prover = SmallSubgroupIPAProver<TypeParam>;
    using ZKData = ZKSumcheckData<TypeParam>;

    auto prover_transcript = TypeParam::Transcript::prover_init_empty();
    std::shared_ptr<typename TypeParam::CommitmentKey> ck;
    ck = CreateCommitmentKey<typename TypeParam::CommitmentKey>();

    ZKData zk_sumcheck_data(this->log_circuit_size, prover_transcript, ck);

    std::vector<FF> multivariate_challenge = this->generate_random_vector(CONST_PROOF_SIZE_LOG_N);

    const FF claimed_inner_product =
        this->compute_claimed_inner_product(zk_sumcheck_data, multivariate_challenge, this->log_circuit_size);

    Prover small_subgroup_ipa_prover =
        Prover(zk_sumcheck_data, multivariate_challenge, claimed_inner_product, prover_transcript, ck);

    auto witness_polynomials = small_subgroup_ipa_prover.get_witness_polynomials();

    std::array<FF, NUM_LIBRA_EVALUATIONS> libra_evaluations = {
        witness_polynomials[0].evaluate(this->evaluation_challenge),
        witness_polynomials[1].evaluate(this->evaluation_challenge * Curve::subgroup_generator),
        witness_polynomials[2].evaluate(this->evaluation_challenge),
        witness_polynomials[3].evaluate(this->evaluation_challenge)
    };

    bool consistency_checked = Verifier::check_evaluations_consistency(
        libra_evaluations, this->evaluation_challenge, multivariate_challenge, claimed_inner_product);

    EXPECT_TRUE(consistency_checked);
}

TYPED_TEST(SmallSubgroupIPATest, ProverAndVerifierSimpleFailure)
{
    using FF = typename TypeParam::FF;
    using Curve = typename TypeParam::Curve;
    using Verifier = SmallSubgroupIPAVerifier<Curve>;
    using Prover = SmallSubgroupIPAProver<TypeParam>;
    using ZKData = ZKSumcheckData<TypeParam>;

    auto prover_transcript = TypeParam::Transcript::prover_init_empty();
    std::shared_ptr<typename TypeParam::CommitmentKey> ck;
    ck = CreateCommitmentKey<typename TypeParam::CommitmentKey>();

    ZKData zk_sumcheck_data(this->log_circuit_size, prover_transcript, ck);

    std::vector<FF> multivariate_challenge = this->generate_random_vector(CONST_PROOF_SIZE_LOG_N);

    const FF claimed_inner_product =
        this->compute_claimed_inner_product(zk_sumcheck_data, multivariate_challenge, this->log_circuit_size);

    Prover small_subgroup_ipa_prover =
        Prover(zk_sumcheck_data, multivariate_challenge, claimed_inner_product, prover_transcript, ck);

    auto witness_polynomials = small_subgroup_ipa_prover.get_witness_polynomials();

    // Tamper with witness polynomials
    witness_polynomials[0].at(0) = FF::random_element();

    std::array<FF, NUM_LIBRA_EVALUATIONS> libra_evaluations = {
        witness_polynomials[0].evaluate(this->evaluation_challenge),
        witness_polynomials[1].evaluate(this->evaluation_challenge * Curve::subgroup_generator),
        witness_polynomials[2].evaluate(this->evaluation_challenge),
        witness_polynomials[3].evaluate(this->evaluation_challenge)
    };

    bool consistency_checked = Verifier::check_evaluations_consistency(
        libra_evaluations, this->evaluation_challenge, multivariate_challenge, claimed_inner_product);

    // Since witness polynomials were modified, the consistency check must fail
    EXPECT_FALSE(consistency_checked);
}

} // namespace bb
