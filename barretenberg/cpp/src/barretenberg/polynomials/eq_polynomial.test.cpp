#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "gate_separator.hpp"
#include <array>
#include <cstdint>
#include <gtest/gtest.h>
#include <span>
#include <vector>

using namespace bb;

// -----------------------------------------------------------------------------
// Fixture with helpers (no logic changes)
// -----------------------------------------------------------------------------
class EqPolyTest : public ::testing::Test {
  public:
    using FF = bb::fr;

  protected:
    // eq(r,u) = ∏_i ((1 - r_i)(1 - u_i) + r_i u_i)
    static FF eq_manual(std::span<const FF> r, std::span<const FF> u)
    {
        EXPECT_EQ(r.size(), u.size());
        FF acc = FF(1);
        for (size_t i = 0; i < r.size(); ++i) {
            const FF term = (FF(1) - r[i]) * (FF(1) - u[i]) + r[i] * u[i];
            acc *= term;
        }
        return acc;
    }

    // Boolean vector of length d from mask (LSB -> index 0)
    static std::vector<FF> bool_vec_from_mask(size_t d, uint64_t mask)
    {
        std::vector<FF> v(d);
        for (size_t i = 0; i < d; ++i) {
            v[i] = FF((mask >> i) & 1ULL);
        }
        return v;
    }

    // γ = r / (1 - r)
    static std::vector<FF> to_gamma(std::span<const FF> r)
    {
        std::vector<FF> g(r.size());
        for (size_t i = 0; i < r.size(); ++i) {
            g[i] = r[i] * (FF(1) - r[i]).invert();
        }
        return g;
    }
};

// -----------------------------------------------------------------------------
// EqVerifierPolynomial tests
// -----------------------------------------------------------------------------

TEST_F(EqPolyTest, InitializeCoeffs)
{
    const std::vector<FF> r = { 0, 1, 2, 3 };
    EqVerifierPolynomial<FF> eq(r);

    ASSERT_EQ(eq.r.size(), 4);
    ASSERT_EQ(eq.a.size(), 4);
    ASSERT_EQ(eq.b.size(), 4);

    // a_i = 2r_i - 1 ; b_i = 1 - r_i
    EXPECT_EQ(eq.a[0], FF(-1));
    EXPECT_EQ(eq.a[1], FF(1));
    EXPECT_EQ(eq.a[2], FF(3));
    EXPECT_EQ(eq.a[3], FF(5));

    EXPECT_EQ(eq.b[0], FF(1));
    EXPECT_EQ(eq.b[1], FF(0));
    EXPECT_EQ(eq.b[2], FF(-1));
    EXPECT_EQ(eq.b[3], FF(-2));
}

TEST_F(EqPolyTest, EvaluateMatchesManualSmall)
{
    const std::vector<FF> r = { 0, 1, 2, 3, 4 };
    const std::vector<FF> u = { 5, 6, 7, 8, 9 };

    EqVerifierPolynomial<FF> eq(r);
    const FF got = eq.evaluate(u);
    const FF expect = eq_manual(r, u);

    EXPECT_EQ(got, expect);
}

TEST_F(EqPolyTest, StaticEvalMatchesMemberEvaluate)
{
    const std::vector<FF> r = { 2, 0, 5, 1 };
    const std::vector<FF> u = { 3, 7, 4, 6 };

    const FF s = EqVerifierPolynomial<FF>::eval(r, u);
    EqVerifierPolynomial<FF> eq(r);
    const FF m = eq.evaluate(u);

    EXPECT_EQ(s, m);
}

TEST_F(EqPolyTest, SymmetryEqRUEqualsEqUR)
{
    const std::vector<FF> r = { 0, 2, 4, 6, 8 };
    const std::vector<FF> u = { 1, 3, 5, 7, 9 };

    EqVerifierPolynomial<FF> eq_r(r);
    EqVerifierPolynomial<FF> eq_u(u);

    const FF ru = eq_r.evaluate(u);
    const FF ur = eq_u.evaluate(r);

    EXPECT_EQ(ru, ur);
}

TEST_F(EqPolyTest, BooleanDeltaBehavior)
{
    constexpr int d = 5;

    const auto make_bool_vec = [&](size_t mask) {
        std::vector<FF> v(d);
        for (size_t i = 0; i < d; ++i) {
            v[i] = FF((mask >> i) & 1);
        }
        return v;
    };

    for (size_t R = 0; R < (1u << d); ++R) {
        const auto r = make_bool_vec(R);
        EqVerifierPolynomial<FF> eq(r);
        for (size_t U = 0; U < (1u << d); ++U) {
            const auto u = make_bool_vec(U);
            const FF val = eq.evaluate(u);
            if (R == U) {
                EXPECT_EQ(val, FF(1)) << "R=" << R << " U=" << U;
            } else {
                EXPECT_EQ(val, FF(0)) << "R=" << R << " U=" << U;
            }
        }
    }
}

TEST_F(EqPolyTest, EdgeCases)
{
    // d = 0: empty product = 1
    {
        std::vector<FF> r, u;
        const FF val = EqVerifierPolynomial<FF>::eval(r, u);
        EXPECT_EQ(val, FF(1));
    }

    // d = 1: explicit formula check
    {
        const std::vector<FF> r = { 2 };
        const std::vector<FF> u = { 7 };
        const FF expect = (FF(1) - r[0]) * (FF(1) - u[0]) + r[0] * u[0];

        EqVerifierPolynomial<FF> eq(r);
        const FF got = eq.evaluate(u);
        EXPECT_EQ(got, expect);
    }

    // all zeros
    {
        const std::vector<FF> r(8, FF(0));
        const std::vector<FF> u(8, FF(0));
        EqVerifierPolynomial<FF> eq(r);
        EXPECT_EQ(eq.evaluate(u), FF(1));
    }

    // all ones
    {
        const std::vector<FF> r(8, FF(1));
        const std::vector<FF> u(8, FF(1));
        EqVerifierPolynomial<FF> eq(r);
        EXPECT_EQ(eq.evaluate(u), FF(1));
    }

    // alternating Boolean pattern
    {
        const std::vector<FF> r = { 0, 1, 0, 1, 0, 1, 0, 1 };
        const std::vector<FF> u = { 1, 0, 1, 0, 1, 0, 1, 0 };
        EqVerifierPolynomial<FF> eq(r);
        EXPECT_EQ(eq.evaluate(u), FF(0));
    }
}

// -----------------------------------------------------------------------------
// Prover/Verifier consistency
// -----------------------------------------------------------------------------

TEST_F(EqPolyTest, ProverTableMatchesVerifierOnBooleanPoints)
{
    const size_t d = 5;

    std::vector<FF> r(d);
    for (size_t i = 0; i < d; ++i) {
        r[i] = FF(2 * i + 7);
    }

    EqVerifierPolynomial<FF> v(r);
    // Assumes a static factory `construct(r, logN)` and `.at(idx)` accessor exist.
    auto peq = ProverEqPolynomial<FF>::construct(r, d);

    for (uint64_t ell = 0; ell < (1ULL << d); ++ell) {
        const auto u = bool_vec_from_mask(d, ell);
        const FF got_ver = v.evaluate(u);
        const FF got_prov = peq.at(ell);
        EXPECT_EQ(got_prov, got_ver) << "ell=" << ell;
    }
}

TEST_F(EqPolyTest, VerifierVsProverForArbitraryU)
{
    const size_t d = 5;

    std::vector<FF> r(d), u(d);
    for (size_t i = 0; i < d; ++i) {
        r[i] = FF(13 + i);
        u[i] = FF(17 + 2 * i);
    }

    EqVerifierPolynomial<FF> v(r);
    const FF ver_val = v.evaluate(u);

    // Prover-side normalized evaluation (no table here):
    FF C = FF(1);
    for (size_t i = 0; i < d; ++i) {
        C *= (FF(1) - r[i]);
    }
    const auto gamma = to_gamma(r);

    FF prov_val = FF(1);
    for (size_t i = 0; i < d; ++i) {
        prov_val *= (FF(1) + u[i] * (gamma[i] - FF(1)));
    }
    prov_val = C * prov_val;

    EXPECT_EQ(ver_val, prov_val);
}

TEST_F(EqPolyTest, PartialEvaluationConsistency)
{
    constexpr size_t d = 21;
    std::vector<FF> r(d);
    std::vector<FF> u(d);
    std::vector<FF> u_part(d);
    for (size_t i = 0; i < d; i++) {
        r[i] = FF::random_element();
        u[i] = FF::random_element();
        u_part[i] = 0;
    }
    auto current_element = EqVerifierPolynomial<FF>::eval(r, u_part);
    auto pol = ProverEqPolynomial<FF>::construct(r, d);
    for (size_t i = 0; i < d; i++) {
        u_part[i] = 1;
        auto new_element = EqVerifierPolynomial<FF>::eval(r, u_part);
        current_element = current_element + u[i] * (new_element - current_element);
        u_part[i] = u[i];
        EXPECT_EQ(current_element, EqVerifierPolynomial<FF>::eval(r, u_part));
    }
    EXPECT_EQ(current_element, EqVerifierPolynomial<FF>::eval(r, u));
}

// -----------------------------------------------------------------------------
// GateSeparatorPolynomial sanity checks
// -----------------------------------------------------------------------------

TEST_F(EqPolyTest, GateSeparatorPartialEvaluationConsistency)
{
    constexpr size_t d = 5;

    std::vector<FF> betas(d);
    for (auto& beta : betas) {
        beta = FF::random_element();
    }

    GateSeparatorPolynomial<FF> poly(betas);

    std::array<FF, d> variables{};
    for (auto& u_i : variables) {
        u_i = FF::random_element();
        poly.partially_evaluate(u_i);
    }

    FF expected_eval = FF(1);
    for (size_t i = 0; i < d; ++i) {
        expected_eval *= (FF(1) - variables[i]) + variables[i] * betas[i];
    }

    EXPECT_EQ(poly.partial_evaluation_result, expected_eval);
}

TEST_F(EqPolyTest, GateSeparatorBetaProductsOnPowers)
{
    const std::vector<FF> betas{ FF(2), FF(4), FF(16) };
    GateSeparatorPolynomial<FF> poly(betas, betas.size());

    const std::vector<FF> expected_values{
        FF(1), FF(2), FF(4), FF(8), FF(16), FF(32), FF(64), FF(128),
    };

    EXPECT_EQ(Polynomial<FF>(expected_values), Polynomial<FF>(poly.beta_products));
}
