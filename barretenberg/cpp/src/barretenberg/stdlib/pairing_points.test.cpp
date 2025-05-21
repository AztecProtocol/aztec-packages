#include "barretenberg/stdlib/pairing_points.hpp"
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
    TypeParam builder;
    info("Num gates: ", builder.num_gates);
    PairingPoints<TypeParam>::add_default_to_public_inputs(builder);
    info("Num gates after add_default_to_public_inputs: ", builder.num_gates);
    builder.finalize_circuit(/*ensure_nonzero=*/true);
    info("Num gates: ", builder.num_gates);
    EXPECT_TRUE(CircuitChecker::check(builder));
}
} // namespace bb::stdlib::recursion
