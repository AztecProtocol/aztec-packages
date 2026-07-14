#include "barretenberg/polynomials/shifted_eq_polynomial.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/polynomials/eq_polynomial.hpp"
#include "barretenberg/polynomials/polynomial.hpp"

#include <array>
#include <gtest/gtest.h>
#include <span>
#include <vector>

using namespace bb;

namespace {

using Curve = curve::Grumpkin;
using FF = typename Curve::ScalarField;
using Poly = bb::Polynomial<FF>;

constexpr size_t LOG_N = 4;
constexpr size_t N = 1UL << LOG_N;
using ShiftedEq = ShiftedEqPolynomial<Curve, LOG_N>;

class ShiftedEqPolynomialTest : public ::testing::Test {
  public:
    static std::vector<FF> random_point()
    {
        std::vector<FF> point(LOG_N);
        for (auto& coordinate : point) {
            coordinate = FF::random_element();
        }
        return point;
    }

    // eq(point) as an explicit vector, from the production constructor.
    static std::vector<FF> eq_tensor(const std::vector<FF>& point)
    {
        const auto eq = ProverEqPolynomial<FF>::construct(point, LOG_N);
        std::vector<FF> result(N);
        for (size_t idx = 0; idx < N; ++idx) {
            result[idx] = eq[idx];
        }
        return result;
    }

    // Non-cyclic shift of eq: b_sh[0] = 0, b_sh[i] = eq(point)_{i-1}.
    static std::vector<FF> shift_tensor(const std::vector<FF>& point)
    {
        const auto eq = eq_tensor(point);
        std::vector<FF> result(N, FF::zero());
        for (size_t idx = 1; idx < N; ++idx) {
            result[idx] = eq[idx - 1];
        }
        return result;
    }

    // The IPA s-vector for round-challenge inverses, derived directly from the fold definition (independent of IPA):
    // the fold uses s_c = rc_inv[LOG_N - 1 - c], so s[mask] = prod over set bits c of rc_inv[LOG_N - 1 - c].
    static std::vector<FF> s_vector(const std::vector<FF>& ipa_round_challenges_inv)
    {
        std::vector<FF> result(N, FF::one());
        for (size_t mask = 0; mask < N; ++mask) {
            FF product = FF::one();
            for (size_t coordinate = 0; coordinate < LOG_N; ++coordinate) {
                if (((mask >> coordinate) & 1U) != 0) {
                    product *= ipa_round_challenges_inv[LOG_N - 1 - coordinate];
                }
            }
            result[mask] = product;
        }
        return result;
    }

    static FF inner_product(std::span<const FF> left, std::span<const FF> right)
    {
        BB_ASSERT_EQ(left.size(), right.size());
        FF result = FF::zero();
        for (size_t idx = 0; idx < left.size(); ++idx) {
            result += left[idx] * right[idx];
        }
        return result;
    }
};

} // namespace

// add_scaled accumulates scaling * shift(eq) into the result: result[i+1] += scaling * eq[i], result[0] untouched.
TEST_F(ShiftedEqPolynomialTest, AddScaledAccumulatesScaledShift)
{
    const auto point = random_point();
    const auto eq = ProverEqPolynomial<FF>::construct(point, LOG_N);
    const FF scaling = FF::random_element();

    Poly result(N);
    ShiftedEq::add_scaled(result, eq, scaling);

    const auto explicit_shift = shift_tensor(point);
    for (size_t idx = 0; idx < N; ++idx) {
        EXPECT_EQ(result[idx], scaling * explicit_shift[idx]) << "idx=" << idx;
    }
}

// evaluate_from_eq(eq, w) = <eq, shift(w)> = sum_i eq[i] * w[i+1] (with w[N] read as 0).
TEST_F(ShiftedEqPolynomialTest, EvaluateFromEqIsEqAgainstShiftedWitness)
{
    const auto point = random_point();
    const auto eq = ProverEqPolynomial<FF>::construct(point, LOG_N);
    const Poly witness = Poly::random(N);

    const FF got = ShiftedEq::evaluate_from_eq(eq, witness);

    FF expected = FF::zero();
    for (size_t idx = 0; idx < N; ++idx) {
        const FF shifted = (idx + 1 < N) ? witness[idx + 1] : FF::zero();
        expected += eq[idx] * shifted;
    }
    EXPECT_EQ(got, expected);
}

// The succinct eq fold equals the explicit eq tensor contracted with the s-vector.
TEST_F(ShiftedEqPolynomialTest, EqFoldMatchesExplicitInnerProduct)
{
    const auto point = random_point();
    const auto ipa_round_challenges_inv = random_point();
    const auto s_vec = s_vector(ipa_round_challenges_inv);

    EXPECT_EQ(ShiftedEq::evaluate_eq_folded(std::span<const FF>(point), std::span<const FF>(ipa_round_challenges_inv)),
              inner_product(eq_tensor(point), s_vec));
}

// The succinct (non-cyclic) shift fold equals the explicit shift tensor contracted with the s-vector. A cyclic
// implementation (b_sh[0] = eq(point)_{n-1} instead of 0) would diverge here.
TEST_F(ShiftedEqPolynomialTest, ShiftFoldMatchesExplicitInnerProduct)
{
    const auto point = random_point();
    const auto ipa_round_challenges_inv = random_point();
    const auto s_vec = s_vector(ipa_round_challenges_inv);

    EXPECT_EQ(ShiftedEq::evaluate_folded(std::span<const FF>(point), std::span<const FF>(ipa_round_challenges_inv)),
              inner_product(shift_tensor(point), s_vec));
}
