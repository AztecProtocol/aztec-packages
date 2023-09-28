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
    using ZeroMorphProver = ZeroMorphProver<TypeParam>;
    size_t n = 16;
    size_t log_n = numeric::get_msb(n);

    // Construct a random multilinear polynomial f, and (u,v) such that f(u) = v.
    auto multilinear_f = this->random_polynomial(n);
    auto u_challenge = this->random_evaluation_point(log_n);
    auto v_evaluation = multilinear_f.evaluate_mle(u_challenge);
    (void)v_evaluation;

    // Compute the multilinear quotients q_k = q_k(X_0, ..., X_{k-1})
    auto quotients = ZeroMorphProver::compute_multivariate_quotients(multilinear_f, u_challenge);

    // WORKTODO: show that the q_k were properly constructed by showing that, for a random multilinear challenge z, the
    // following holds: f(z) - v = \sum_{k=0}^{d-1} (z_k - u_k)q_k(z)
    auto z_challenge = this->random_evaluation_point(log_n);

    EXPECT_TRUE(true);
}

TYPED_TEST(ZeroMorphTest, Single)
{
    using Fr = typename TypeParam::ScalarField;
    using Commitment = typename TypeParam::AffineElement;
    using ZeroMorphProver = ZeroMorphProver<TypeParam>;
    size_t N_max = 25; // ???
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
