#include "barretenberg/commitment_schemes/pairing_points.hpp"
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/srs/global_crs.hpp"

#include <gtest/gtest.h>

namespace bb {

class NativePairingPointsTests : public ::testing::Test {
  public:
    using Curve = curve::BN254;
    using PP = PairingPoints<Curve>;
    using Point = Curve::AffineElement;

    static void SetUpTestSuite() { srs::init_file_crs_factory(srs::bb_crs_path()); }

    // P0 = [s]₁, P1 = -[1]₁ satisfies e(P0,[1]₂)·e(P1,[s]₂) = 1
    static PP make_valid_pairing_points()
    {
        CommitmentKey<Curve> ck(2);
        auto srs = ck.get_monomial_points();
        return PP(srs[1], -srs[0]);
    }
};

// Default construction produces infinity points
TEST_F(NativePairingPointsTests, DefaultConstructionIsInfinity)
{
    PP pp;
    EXPECT_EQ(pp.P0(), Point::infinity());
    EXPECT_EQ(pp.P1(), Point::infinity());
}

// Infinity points pass the pairing check: e(∞, Q) = 1
TEST_F(NativePairingPointsTests, InfinityPassesPairingCheck)
{
    PP pp;
    EXPECT_TRUE(pp.check());
}

// Valid SRS-derived points pass the pairing check
TEST_F(NativePairingPointsTests, ValidPointsPassPairingCheck)
{
    PP pp = make_valid_pairing_points();
    EXPECT_TRUE(pp.check());
}

// Arbitrary non-trivial points fail the pairing check
TEST_F(NativePairingPointsTests, InvalidPointsFailPairingCheck)
{
    Point G = Point::one();
    PP pp(G, G);
    EXPECT_FALSE(pp.check());
}

// Aggregating into default (infinity) adopts the incoming points
TEST_F(NativePairingPointsTests, AggregateIntoDefaultAdoptsOther)
{
    PP acc;
    PP other = make_valid_pairing_points();
    acc.aggregate(other);
    EXPECT_EQ(acc.P0(), other.P0());
    EXPECT_EQ(acc.P1(), other.P1());
}

// Aggregating two populated sets produces a valid result
TEST_F(NativePairingPointsTests, AggregatePopulatedPoints)
{
    PP acc = make_valid_pairing_points();
    PP other = make_valid_pairing_points();
    acc.aggregate(other);
    EXPECT_TRUE(acc.check());
}

// Aggregating infinity into a populated accumulator throws
TEST_F(NativePairingPointsTests, AggregateInfinityIntoPopulatedThrows)
{
    PP acc = make_valid_pairing_points();
    PP empty;
    EXPECT_THROW(acc.aggregate(empty), std::runtime_error);
}

// A mixed-infinity accumulator (exactly one point at infinity) is corrupt: aggregation must reject it rather
// than treat it as uninitialized and silently discard the real point by adopting the incoming points.
TEST_F(NativePairingPointsTests, AggregateMixedInfinityAccumulatorP0AtInfinityThrows)
{
    PP acc(Point::infinity(), Point::one());
    PP other = make_valid_pairing_points();
    EXPECT_THROW(acc.aggregate(other), std::runtime_error);
}

TEST_F(NativePairingPointsTests, AggregateMixedInfinityAccumulatorP1AtInfinityThrows)
{
    PP acc(Point::one(), Point::infinity());
    PP other = make_valid_pairing_points();
    EXPECT_THROW(acc.aggregate(other), std::runtime_error);
}

// Mixed-infinity incoming points are equally invalid and must be rejected.
TEST_F(NativePairingPointsTests, AggregateMixedInfinityOtherP0AtInfinityThrows)
{
    PP acc = make_valid_pairing_points();
    PP other(Point::infinity(), Point::one());
    EXPECT_THROW(acc.aggregate(other), std::runtime_error);
}

TEST_F(NativePairingPointsTests, AggregateMixedInfinityOtherP1AtInfinityThrows)
{
    PP acc = make_valid_pairing_points();
    PP other(Point::one(), Point::infinity());
    EXPECT_THROW(acc.aggregate(other), std::runtime_error);
}

} // namespace bb
