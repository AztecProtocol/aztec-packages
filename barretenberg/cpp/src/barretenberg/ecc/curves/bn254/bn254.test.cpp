/**
 * @brief Tests that verify the correctness of BN-254 field constants
 *
 */
#include "bn254.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include <array>
#include <gtest/gtest.h>

using namespace bb;

// ================================
// BN254 Constants Tests
// ================================

TEST(Bn254Constants, SubgroupGenerator)
{
    fr subgroup_generator = bb::curve::BN254::subgroup_generator;
    fr subgroup_generator_inverse = bb::curve::BN254::subgroup_generator_inverse;
    fr expected = fr(5).pow((fr::modulus - 1) / (uint256_t(1) << 8));
    fr expected_inverse = expected.invert();

    EXPECT_EQ(subgroup_generator, expected);
    EXPECT_EQ(subgroup_generator_inverse, expected_inverse);
}
