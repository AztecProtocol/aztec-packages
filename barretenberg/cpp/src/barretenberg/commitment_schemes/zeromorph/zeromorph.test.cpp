#include "barretenberg/commitment_schemes/zeromorph/zeromorph.test.hpp"
#include <gtest/gtest.h>

using namespace bb;

using PCSTypes = ::testing::Types<KZG<curve::BN254>, IPA<curve::Grumpkin>>;
TYPED_TEST_SUITE(ZeroMorphTest, PCSTypes);
TYPED_TEST_SUITE(ZeroMorphWithConcatenationTest, PCSTypes);

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
    using ZeroMorphProver = ZeroMorphProver_<TypeParam>;
    using Curve = typename TypeParam::Curve;
    using Fr = typename Curve::ScalarField;
    using Polynomial = bb::Polynomial<Fr>;

    // Define size parameters
    size_t N = 16;
    size_t log_N = numeric::get_msb(N);

    // Construct a random multilinear polynomial f, and (u,v) such that f(u) = v.
    Polynomial multilinear_f = this->random_polynomial(N);
    std::vector<Fr> u_challenge = this->random_evaluation_point(log_N);
    Fr v_evaluation = multilinear_f.evaluate_mle(u_challenge);

    // Compute the multilinear quotients q_k = q_k(X_0, ..., X_{k-1})
    std::vector<Polynomial> quotients = ZeroMorphProver::compute_multilinear_quotients(multilinear_f, u_challenge);

    // Show that the q_k were properly constructed by showing that the identity holds at a random multilinear challenge
    // z, i.e. f(z) - v - \sum_{k=0}^{d-1} (z_k - u_k)q_k(z) = 0
    std::vector<Fr> z_challenge = this->random_evaluation_point(log_N);

    Fr result = multilinear_f.evaluate_mle(z_challenge);
    result -= v_evaluation;
    for (size_t k = 0; k < log_N; ++k) {
        auto q_k_eval = Fr(0);
        if (k == 0) {
            // q_0 = a_0 is a constant polynomial so it's evaluation is simply its constant coefficient
            q_k_eval = quotients[k][0];
        } else {
            // Construct (u_0, ..., u_{k-1})
            auto subrange_size = static_cast<std::ptrdiff_t>(k);
            std::vector<Fr> z_partial(z_challenge.begin(), z_challenge.begin() + subrange_size);
            q_k_eval = quotients[k].evaluate_mle(z_partial);
        }
        // result = result - (z_k - u_k) * q_k(u_0, ..., u_{k-1})
        result -= (z_challenge[k] - u_challenge[k]) * q_k_eval;
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
    using ZeroMorphProver = ZeroMorphProver_<TypeParam>;
    using Curve = typename TypeParam::Curve;
    using Fr = typename Curve::ScalarField;
    using Polynomial = bb::Polynomial<Fr>;

    const size_t N = 8;

    // Define some mock q_k with deg(q_k) = 2^k - 1
    std::vector<Fr> data_0 = { 1 };
    std::vector<Fr> data_1 = { 2, 3 };
    std::vector<Fr> data_2 = { 4, 5, 6, 7 };
    Polynomial q_0(data_0);
    Polynomial q_1(data_1);
    Polynomial q_2(data_2);
    std::vector<Polynomial> quotients = { q_0, q_1, q_2 };

    auto y_challenge = Fr::random_element();

    // Compute batched quotient \hat{q} using the prover method
    auto batched_quotient = ZeroMorphProver::compute_batched_lifted_degree_quotient(quotients, y_challenge, N);

    // Now explicitly define q_k_lifted = X^{N-2^k} * q_k and compute the expected batched result
    std::array<Fr, N> data_0_lifted = { 0, 0, 0, 0, 0, 0, 0, 1 };
    std::array<Fr, N> data_1_lifted = { 0, 0, 0, 0, 0, 0, 2, 3 };
    std::array<Fr, N> data_2_lifted = { 0, 0, 0, 0, 4, 5, 6, 7 };
    Polynomial q_0_lifted(data_0_lifted);
    Polynomial q_1_lifted(data_1_lifted);
    Polynomial q_2_lifted(data_2_lifted);

    // Explicitly compute \hat{q}
    auto batched_quotient_expected = Polynomial(N);
    batched_quotient_expected += q_0_lifted;
    batched_quotient_expected.add_scaled(q_1_lifted, y_challenge);
    batched_quotient_expected.add_scaled(q_2_lifted, y_challenge * y_challenge);

    EXPECT_EQ(batched_quotient, batched_quotient_expected);
}

/**
 * @brief Test function for constructing partially evaluated quotient \zeta_x
 *
 */
TYPED_TEST(ZeroMorphTest, PartiallyEvaluatedQuotientZeta)
{
    // Define some useful type aliases
    using ZeroMorphProver = ZeroMorphProver_<TypeParam>;
    using Curve = typename TypeParam::Curve;
    using Fr = typename Curve::ScalarField;
    using Polynomial = bb::Polynomial<Fr>;

    const size_t N = 8;

    // Define some mock q_k with deg(q_k) = 2^k - 1
    std::vector<Fr> data_0 = { 1 };
    std::vector<Fr> data_1 = { 2, 3 };
    std::vector<Fr> data_2 = { 4, 5, 6, 7 };
    Polynomial q_0(data_0);
    Polynomial q_1(data_1);
    Polynomial q_2(data_2);
    std::vector<Polynomial> quotients = { q_0, q_1, q_2 };

    auto y_challenge = Fr::random_element();

    auto batched_quotient = ZeroMorphProver::compute_batched_lifted_degree_quotient(quotients, y_challenge, N);

    auto x_challenge = Fr::random_element();

    // Contruct zeta_x using the prover method
    auto zeta_x = ZeroMorphProver::compute_partially_evaluated_degree_check_polynomial(
        batched_quotient, quotients, y_challenge, x_challenge);

    // Now construct zeta_x explicitly
    auto zeta_x_expected = Polynomial(N);
    zeta_x_expected += batched_quotient;
    // q_batched - \sum_k q_k * y^k * x^{N - deg(q_k) - 1}
    zeta_x_expected.add_scaled(q_0, -x_challenge.pow(N - 0 - 1));
    zeta_x_expected.add_scaled(q_1, -y_challenge * x_challenge.pow(N - 1 - 1));
    zeta_x_expected.add_scaled(q_2, -y_challenge * y_challenge * x_challenge.pow(N - 3 - 1));

    EXPECT_EQ(zeta_x, zeta_x_expected);
}

/**
 * @brief Demonstrate formulas for efficiently computing \Phi_k(x) = \sum_{i=0}^{k-1}x^i
 * @details \Phi_k(x) = \sum_{i=0}^{k-1}x^i = (x^{2^k} - 1) / (x - 1)
 *
 */
TYPED_TEST(ZeroMorphTest, PhiEvaluation)
{
    using Curve = typename TypeParam::Curve;
    using Fr = typename Curve::ScalarField;
    const size_t N = 8;
    size_t n = numeric::get_msb(N);

    // \Phi_n(x)
    {
        auto x_challenge = Fr::random_element();

        auto efficient = (x_challenge.pow(1 << n) - 1) / (x_challenge - 1);

        auto expected = this->Phi(x_challenge, n);

        EXPECT_EQ(efficient, expected);
    }

    // \Phi_{n-k-1}(x^{2^{k + 1}}) = (x^{2^n} - 1) / (x^{2^{k + 1}} - 1)
    {
        auto x_challenge = Fr::random_element();

        size_t k = 2;

        // x^{2^{k+1}}
        auto x_pow = x_challenge.pow(1 << (k + 1));

        auto efficient = x_challenge.pow(1 << n) - 1; // x^N - 1
        efficient = efficient / (x_pow - 1);          // (x^N - 1) / (x^{2^{k + 1}} - 1)

        auto expected = this->Phi(x_pow, n - k - 1);
        EXPECT_EQ(efficient, expected);
    }
}

/**
 * @brief Test function for constructing partially evaluated quotient Z_x
 *
 */
TYPED_TEST(ZeroMorphTest, PartiallyEvaluatedQuotientZ)
{
    // Define some useful type aliases
    using ZeroMorphProver = ZeroMorphProver_<TypeParam>;
    using Curve = typename TypeParam::Curve;
    using Fr = typename Curve::ScalarField;
    using Polynomial = bb::Polynomial<Fr>;

    const size_t N = 8;
    size_t log_N = numeric::get_msb(N);

    // Construct a random multilinear polynomial f, and (u,v) such that f(u) = v.
    Polynomial multilinear_f = this->random_polynomial(N);
    Polynomial multilinear_g = this->random_polynomial(N);
    multilinear_g[0] = 0;
    std::vector<Fr> u_challenge = this->random_evaluation_point(log_N);
    Fr v_evaluation = multilinear_f.evaluate_mle(u_challenge);
    Fr w_evaluation = multilinear_g.evaluate_mle(u_challenge, /* shift = */ true);

    auto rho = Fr::random_element();

    // compute batched polynomial and evaluation
    auto f_batched = multilinear_f;
    auto g_batched = multilinear_g;
    g_batched *= rho;
    auto v_batched = v_evaluation + rho * w_evaluation;

    // Define some mock q_k with deg(q_k) = 2^k - 1
    auto q_0 = this->random_polynomial(1 << 0);
    auto q_1 = this->random_polynomial(1 << 1);
    auto q_2 = this->random_polynomial(1 << 2);
    std::vector<Polynomial> quotients = { q_0, q_1, q_2 };

    auto x_challenge = Fr::random_element();

    // Construct Z_x using the prover method
    auto Z_x = ZeroMorphProver::compute_partially_evaluated_zeromorph_identity_polynomial(
        f_batched, g_batched, quotients, v_batched, u_challenge, x_challenge);

    // Compute Z_x directly
    auto Z_x_expected = g_batched;
    Z_x_expected.add_scaled(f_batched, x_challenge);
    Z_x_expected[0] -= v_batched * x_challenge * this->Phi(x_challenge, log_N);
    for (size_t k = 0; k < log_N; ++k) {
        auto x_pow_2k = x_challenge.pow(1 << k);         // x^{2^k}
        auto x_pow_2kp1 = x_challenge.pow(1 << (k + 1)); // x^{2^{k+1}}
        // x^{2^k} * \Phi_{n-k-1}(x^{2^{k+1}}) - u_k *  \Phi_{n-k}(x^{2^k})
        auto scalar = x_pow_2k * this->Phi(x_pow_2kp1, log_N - k - 1) - u_challenge[k] * this->Phi(x_pow_2k, log_N - k);
        scalar *= x_challenge;
        scalar *= Fr(-1);
        Z_x_expected.add_scaled(quotients[k], scalar);
    }

    EXPECT_EQ(Z_x, Z_x_expected);
}

/**
 * @brief Test full Prover/Verifier protocol for proving single multilinear evaluation
 *
 */
TYPED_TEST(ZeroMorphTest, ProveAndVerifySingle)
{
    size_t num_unshifted = 1;
    size_t num_shifted = 0;
    auto verified = this->execute_zeromorph_protocol(num_unshifted, num_shifted);
    EXPECT_TRUE(verified);
}

/**
 * @brief Test full Prover/Verifier protocol for proving batched multilinear evaluation with shifts
 *
 */
TYPED_TEST(ZeroMorphTest, ProveAndVerifyBatchedWithShifts)
{
    size_t num_unshifted = 3;
    size_t num_shifted = 2;
    auto verified = this->execute_zeromorph_protocol(num_unshifted, num_shifted);
    EXPECT_TRUE(verified);
}

/**
 * @brief Test full Prover/Verifier protocol for proving single multilinear evaluation
 *
 */
TYPED_TEST(ZeroMorphWithConcatenationTest, ProveAndVerify)
{
    size_t num_unshifted = 1;
    size_t num_shifted = 0;
    size_t num_concatenated = 3;
    auto verified = this->execute_zeromorph_protocol(num_unshifted, num_shifted, num_concatenated);
    EXPECT_TRUE(verified);
}