#include <gtest/gtest.h>

#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/vm2/common/standard_affine_point.hpp"

namespace bb::avm2 {
namespace {

using EmbeddedCurvePoint = StandardAffinePoint<grumpkin::g1::affine_element>;
using Fr = grumpkin::fr;
using Fq = grumpkin::fq;

TEST(StandardAffinePointTest, ConstructingInfinityNormalized)
{
    // Constructing a point with (0,0) coordinates should result in infinity
    EmbeddedCurvePoint inf(0, 0);
    EXPECT_TRUE(inf.is_infinity());
    // Constructing a point with BB's inf should result in infinity with (0,0) coordinates
    EmbeddedCurvePoint inf_bb(grumpkin::g1::affine_element::infinity());
    EXPECT_TRUE(inf_bb.is_infinity());
    EXPECT_TRUE(inf_bb.x().is_zero());
    EXPECT_TRUE(inf_bb.y().is_zero());
    EXPECT_EQ(inf, inf_bb);
}

TEST(StandardAffinePointTest, NormalPointCoordinates)
{
    // Normal (non-infinity) points should return their coordinates
    auto one = EmbeddedCurvePoint::one();
    EXPECT_FALSE(one.is_infinity());
    EXPECT_FALSE(one.x().is_zero());
    EXPECT_FALSE(one.y().is_zero());
}

TEST(StandardAffinePointTest, AdditionResultingInInfinityNormalized)
{
    // When addition produces infinity, result should have (0,0) coordinates
    auto p = EmbeddedCurvePoint::one();
    auto neg_p = -p;

    auto inf_result = p + neg_p;

    EXPECT_TRUE(inf_result.is_infinity());
    EXPECT_TRUE(inf_result.x().is_zero());
    EXPECT_TRUE(inf_result.y().is_zero());
}

TEST(StandardAffinePointTest, SubtractingInfinityNormalized)
{
    // Subtracting a point from itself should yield infinity with (0,0) coordinates
    auto p = EmbeddedCurvePoint::one();
    auto inf = EmbeddedCurvePoint::infinity();

    auto result = p + (-inf);

    EXPECT_EQ(result, p);
}

TEST(StandardAffinePointTest, ScalarMultiplicationResultingInInfinityNormalized)
{
    // When scalar multiplication produces infinity, result should have (0,0) coordinates
    auto p = EmbeddedCurvePoint::one();
    Fr zero_scalar = Fr::zero();

    auto inf_result = p * zero_scalar;

    EXPECT_TRUE(inf_result.is_infinity());
    EXPECT_TRUE(inf_result.x().is_zero());
    EXPECT_TRUE(inf_result.y().is_zero());
}

TEST(StandardAffinePointTest, StaticInfinityHasZeroCoordinates)
{
    // The static infinity() method should return (0,0)
    auto& inf = EmbeddedCurvePoint::infinity();

    EXPECT_TRUE(inf.is_infinity());
    EXPECT_TRUE(inf.x().is_zero());
    EXPECT_TRUE(inf.y().is_zero());
}

TEST(StandardAffinePointTest, NegatingInfinity)
{
    // Negating an infinity point should return (0,0)
    auto neg_inf = -EmbeddedCurvePoint::infinity();

    EXPECT_TRUE(neg_inf.is_infinity());
    EXPECT_TRUE(neg_inf.x().is_zero());
    EXPECT_TRUE(neg_inf.y().is_zero());
}

} // namespace
} // namespace bb::avm2
