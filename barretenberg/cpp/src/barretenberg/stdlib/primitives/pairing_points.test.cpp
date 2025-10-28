#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "barretenberg/commitment_schemes/pairing_points.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include <gtest/gtest.h>

namespace bb::stdlib::recursion {

template <typename Builder> class PairingPointsTests : public testing::Test {
  public:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

using Builders = testing::Types<UltraCircuitBuilder, MegaCircuitBuilder>;
TYPED_TEST_SUITE(PairingPointsTests, Builders);

TYPED_TEST(PairingPointsTests, ConstructDefault)
{
    static constexpr size_t NUM_GATES_ADDED = 20;

    TypeParam builder;

    size_t num_gates = builder.num_gates();
    PairingPoints<TypeParam>::set_default_to_public(&builder);
    EXPECT_EQ(NUM_GATES_ADDED, builder.num_gates() - num_gates)
        << "There has been a change in the number of gates required to set default PairingPoints as public inputs.";

    EXPECT_TRUE(CircuitChecker::check(builder));
}

TYPED_TEST(PairingPointsTests, TestDefault)
{
    using Builder = TypeParam;
    using Group = PairingPoints<Builder>::Group;
    using CommitmentKey = bb::CommitmentKey<curve::BN254>;

    Builder builder;

    Group P0(DEFAULT_PAIRING_POINTS_P0_X, DEFAULT_PAIRING_POINTS_P0_Y);
    Group P1(DEFAULT_PAIRING_POINTS_P1_X, DEFAULT_PAIRING_POINTS_P1_Y);
    P0.convert_constant_to_fixed_witness(&builder);
    P1.convert_constant_to_fixed_witness(&builder);
    PairingPoints<Builder> pp(P0, P1);
    pp.set_public();
    EXPECT_TRUE(CircuitChecker::check(builder));

    // Validate default PairingPoints
    CommitmentKey commitment_key;
    bb::PairingPoints native_pp(P0.get_value(), P1.get_value());
    EXPECT_TRUE(native_pp.check()) << "Default PairingPoints are not valid pairing points.";
}
} // namespace bb::stdlib::recursion
