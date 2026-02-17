#include "gate_separator.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <gtest/gtest.h>

using namespace bb;

TEST(GateSeparatorPolynomial, FullPowConsistency)
{
    constexpr size_t d = 5;
    std::vector<fr> betas(d);
    for (auto& beta : betas) {
        beta = fr::random_element();
    }

    GateSeparatorPolynomial<fr> poly(betas);
    std::array<fr, d> variables{};
    for (auto& u_i : variables) {
        u_i = fr::random_element();
    }

    size_t beta_idx = 0;
    fr expected_eval = 1;
    for (auto& u_i : variables) {
        poly.partially_evaluate(u_i);
        expected_eval *= fr(1) - u_i + u_i * poly.betas[beta_idx];
        beta_idx++;
        // Check that current partial evaluation result is equal to the expected evaluation
        EXPECT_EQ(poly.partial_evaluation_result, expected_eval);
    }
}

TEST(GateSeparatorPolynomial, GateSeparatorPolynomialsOnPowers)
{
    std::vector<fr> betas{ 2, 4, 16 };
    GateSeparatorPolynomial<fr> poly(betas, betas.size());
    std::vector<fr> expected_values{ 1, 2, 4, 8, 16, 32, 64, 128 };
    EXPECT_EQ(bb::Polynomial<fr>(expected_values), bb::Polynomial<fr>(poly.beta_products));
}

TEST(GateSeparatorPolynomial, GateSeparatorPolynomialsOnPowersWithDifferentBeta)
{
    constexpr size_t d = 5;
    std::vector<fr> betas(d);
    for (auto& beta : betas) {
        beta = fr::random_element();
    }
    // Compute the beta products
    std::vector<fr> expected_beta_products(1 << d);
    for (size_t i = 0; i < (1 << d); i++) {
        expected_beta_products[i] = 1;
        for (size_t j = 0; j < d; j++) {
            if (i & (1 << j)) {
                expected_beta_products[i] *= betas[j];
            }
        }
    }
    GateSeparatorPolynomial<fr> poly(betas, betas.size());
    EXPECT_EQ(bb::Polynomial<fr>(expected_beta_products), bb::Polynomial<fr>(poly.beta_products));
}
