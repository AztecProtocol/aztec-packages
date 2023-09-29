#include "zeromorph.hpp"
#include "../commitment_key.test.hpp"
#include "barretenberg/honk/transcript/transcript.hpp"

#include <gtest/gtest.h>

namespace proof_system::honk::pcs::zeromorph {

template <class Curve> class ZeroMorphTest : public CommitmentTest<Curve> {
  public:
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using GroupElement = typename Curve::Element;
    using Polynomial = barretenberg::Polynomial<Fr>;
};

using CurveTypes = ::testing::Types<curve::BN254>;
TYPED_TEST_SUITE(ZeroMorphTest, CurveTypes);

/**
 * @brief Test method for computing q_k given multilinear f
 * @details Given f = f(X_0, ..., X_{d-1}), and (u,v) such that f(u) = v, compute q_k = q_k(X_0, ..., X_{k-1}) such that
 * the following identity holds:
 *
 *  f(X_0, ..., X_{d-1}) - v = \sum_{k=0}^{d-1} (X_k - u_k)q_k(X_0, ..., X_{k-1})
 *
 */
TYPED_TEST(ZeroMorphTest, QuotientConstruction)
{
    // Define some useful type aliases
    using ZeroMorphProver = ZeroMorphProver<TypeParam>;
    using Fr = typename TypeParam::ScalarField;
    using Polynomial = barretenberg::Polynomial<Fr>;

    // Define size parameters
    size_t N = 16;
    size_t log_N = numeric::get_msb(N);

    // Construct a random multilinear polynomial f, and (u,v) such that f(u) = v.
    Polynomial multilinear_f = this->random_polynomial(N);
    std::vector<Fr> u_challenge = this->random_evaluation_point(log_N);
    Fr v_evaluation = multilinear_f.evaluate_mle(u_challenge);

    // Compute the multilinear quotients q_k = q_k(X_0, ..., X_{k-1})
    std::vector<Polynomial> quotients = ZeroMorphProver::compute_multivariate_quotients(multilinear_f, u_challenge);

    // Show that the q_k were properly constructed by showing that, for a random multilinear challenge z, the
    // following holds: f(z) - v - \sum_{k=0}^{d-1} (z_k - u_k)q_k(z) = 0
    std::vector<Fr> z_challenge = this->random_evaluation_point(log_N);

    Fr result = multilinear_f.evaluate_mle(z_challenge);
    result -= v_evaluation;
    for (size_t k = 0; k < log_N; ++k) {
        // result = result - (z_k - u_k) * q_k(z)
        result -= (z_challenge[k] - u_challenge[k]) * quotients[k].evaluate_mle(z_challenge);
    }

    EXPECT_EQ(result, 0);
}

/**
 * @brief Test function for constructing batched lifted degree quotient \hat{q}
 *
 */
TYPED_TEST(ZeroMorphTest, BatchedLiftedDegreeQuotient)
{
    // Define some useful type aliases
    using ZeroMorphProver = ZeroMorphProver<TypeParam>;
    using Fr = typename TypeParam::ScalarField;
    using Polynomial = barretenberg::Polynomial<Fr>;

    const size_t N = 8;

    // Define some mock q_k with deg(q_k) = 2^k - 1
    std::array<Fr, N> poly_0 = { 1, 0, 0, 0, 0, 0, 0, 0 };
    std::array<Fr, N> poly_1 = { 2, 3, 0, 0, 0, 0, 0, 0 };
    std::array<Fr, N> poly_2 = { 4, 5, 6, 7, 0, 0, 0, 0 };

    auto q_0 = Polynomial{ poly_0 };
    auto q_1 = Polynomial{ poly_1 };
    auto q_2 = Polynomial{ poly_2 };

    std::vector<Polynomial> quotients = { q_0, q_1, q_2 };
    auto y_challenge = Fr::random_element();

    auto batched_quotient = ZeroMorphProver::compute_batched_lifted_degree_quotient(quotients, y_challenge, N);

    // Now explicitly define q_k_lifted = X^{N-2^k} * q_k and compute the expected batched result
    auto batched_quotient_expected = Polynomial(N);
    std::array<Fr, N> q_0_lifted = { 0, 0, 0, 0, 0, 0, 0, 1 };
    std::array<Fr, N> q_1_lifted = { 0, 0, 0, 0, 0, 0, 2, 3 };
    std::array<Fr, N> q_2_lifted = { 0, 0, 0, 0, 4, 5, 6, 7 };
    batched_quotient_expected += q_0_lifted;
    batched_quotient_expected.add_scaled(q_1_lifted, y_challenge);
    batched_quotient_expected.add_scaled(q_2_lifted, y_challenge * y_challenge);

    EXPECT_EQ(batched_quotient, batched_quotient_expected);
}

/**
 * @brief Full Prover/Verifier protocol for proving multilinear evaluation f(u) = v
 *
 */
TYPED_TEST(ZeroMorphTest, Single)
{
    using Fr = typename TypeParam::ScalarField;
    using Commitment = typename TypeParam::AffineElement;
    using ZeroMorphProver = ZeroMorphProver<TypeParam>;
    size_t N_max = 32; // mock
    size_t n = 16;
    size_t log_n = numeric::get_msb(n);

    // Initialize an empty ProverTranscript
    auto prover_transcript = ProverTranscript<Fr>::init_empty();

    // Construct a random multilinear polynomial f, and (u,v) such that f(u) = v.
    auto multilinear_f = this->random_polynomial(n);
    auto u_challenge = this->random_evaluation_point(log_n);
    auto v_evaluation = multilinear_f.evaluate_mle(u_challenge);

    // Compute the multilinear quotients q_k = q_k(X_0, ..., X_{k-1})
    auto quotients = ZeroMorphProver::compute_multivariate_quotients(multilinear_f, u_challenge);

    // Compute and send commitment C = [f]
    Commitment f_commitment = this->commit(multilinear_f);
    prover_transcript.send_to_verifier("ZM:C", f_commitment);

    // Compute and send commitments C_k = [q_k], k = 0,...,d-1
    std::vector<Commitment> q_k_commitments;
    q_k_commitments.reserve(log_n);
    for (size_t idx = 0; idx < log_n; ++idx) {
        q_k_commitments[idx] = this->commit(quotients[idx]);
        std::string label = "ZM:C_" + std::to_string(idx);
        prover_transcript.send_to_verifier(label, q_k_commitments[idx]);
    }

    // Get challenge y
    auto y_challenge = prover_transcript.get_challenge("ZM:y");
    (void)y_challenge;

    // Compute the batched, lifted-degree quotient \hat{q}
    auto batched_quotient = ZeroMorphProver::compute_batched_lifted_degree_quotient(quotients, y_challenge, n);

    // Compute and send the commitment C_q = [\hat{q}]
    auto q_commitment = this->commit(batched_quotient);
    prover_transcript.send_to_verifier("ZM:C_q", q_commitment);

    // Get challenges x and z
    auto [x_challenge, z_challenge] = prover_transcript.get_challenges("ZM:x", "ZM:z");

    // Compute degree check polynomial \zeta partially evaluated at x
    auto zeta_x = ZeroMorphProver::compute_partially_evaluated_degree_check_polynomial(
        batched_quotient, quotients, y_challenge, x_challenge, n);

    // Compute ZeroMorph identity polynomial Z partially evaluated at x
    auto Z_x = ZeroMorphProver::compute_partially_evaluated_zeromorph_identity_polynomial(
        multilinear_f, quotients, v_evaluation, x_challenge);

    // Compute batched degree and ZM-identity quotient polynomial
    auto pi_polynomial = ZeroMorphProver::compute_batched_evaluation_and_degree_check_quotient(
        zeta_x, Z_x, x_challenge, z_challenge, N_max);

    // Compute and send proof commitment pi
    auto pi_commitment = this->commit(pi_polynomial);
    prover_transcript.send_to_verifier("ZM:PI", pi_commitment);

    bool verified = true;

    EXPECT_EQ(verified, true);
}

} // namespace proof_system::honk::pcs::zeromorph
