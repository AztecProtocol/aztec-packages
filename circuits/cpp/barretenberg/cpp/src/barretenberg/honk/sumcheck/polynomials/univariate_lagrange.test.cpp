#include "univariate_lagrange.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include <gtest/gtest.h>

#pragma GCC diagnostic ignored "-Wunused-variable"

using namespace proof_system::honk::sumcheck;
namespace test_univariate_lagrange {

template <typename FF> class UnivariateLagrangeTest : public testing::Test {
  public:
    using FF_ = FF;
};

using FieldTypes = testing::Types<barretenberg::fr>;
TYPED_TEST_SUITE(UnivariateLagrangeTest, FieldTypes);

#define ALIASES using FF = TypeParam;
// IMPROVEMENT: Can't make alias for Univariate<FF, _> for some reason.
// Might be convenient to solve boilerplate or repeated type aliasing
// using this or some other means.

TYPED_TEST(UnivariateLagrangeTest, Constructors)
{
    ALIASES
    constexpr size_t domain_size = 8;
    constexpr size_t center_idx = 1;
    auto lagrange = LagrangeMultiple<FF, domain_size, center_idx>();

    const auto compute_lagrange_naive = [&](FF new_point) {
        FF result = 1;
        FF denominator = 1;
        FF center = center_idx;

        for (size_t idx = 0; idx < domain_size; idx++) {
            if (idx != center_idx) {
                result *= (new_point - FF(idx));
                denominator *= (center - FF(idx));
            }
        }
        result /= denominator;
        return result;
    };

    EXPECT_EQ(lagrange.evaluations[0], compute_lagrange_naive(0));
    EXPECT_EQ(lagrange.evaluations[1], compute_lagrange_naive(1));
    EXPECT_EQ(lagrange.evaluations[7], compute_lagrange_naive(7));

    auto extended = lagrange.template extend<16>();

    for (size_t idx = 0; idx < 16; idx++) {
        EXPECT_EQ(extended.evaluations[idx], compute_lagrange_naive(idx));
    }
}

} // namespace test_univariate_lagrange
