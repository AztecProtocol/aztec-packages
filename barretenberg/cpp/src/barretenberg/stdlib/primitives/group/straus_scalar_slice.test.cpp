#include "barretenberg/stdlib/primitives/group/straus_scalar_slice.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_scalar.hpp"
#include "barretenberg/stdlib/primitives/test_utils.hpp"
#include "barretenberg/stdlib/primitives/witness/witness.hpp"
#include <gtest/gtest.h>

using namespace bb;

namespace {
auto& engine = numeric::get_debug_randomness();
}

template <class Builder> class StrausScalarSliceTest : public ::testing::Test {
  public:
    using field_t = stdlib::field_t<Builder>;
    using witness_t = stdlib::witness_t<Builder>;
    using cycle_scalar = stdlib::cycle_scalar<Builder>;
    using straus_scalar_slices = stdlib::straus_scalar_slices<Builder>;
    using Curve = typename Builder::EmbeddedCurve;
    using ScalarField = typename Curve::ScalarField;
};

using CircuitTypes = ::testing::Types<bb::UltraCircuitBuilder, bb::MegaCircuitBuilder>;
TYPED_TEST_SUITE(StrausScalarSliceTest, CircuitTypes);

STANDARD_TESTING_TAGS

using bb::stdlib::test_utils::check_circuit_and_gate_count;

/**
 * @brief Test slice reading and value reconstruction
 */
TYPED_TEST(StrausScalarSliceTest, TestSliceReadAndReconstruction)
{
    using Builder = TypeParam;
    using cycle_scalar = typename TestFixture::cycle_scalar;
    using straus_scalar_slices = typename TestFixture::straus_scalar_slices;
    using ScalarField = typename TestFixture::ScalarField;

    Builder builder;

    auto scalar_val = ScalarField::random_element(&engine);
    auto scalar = cycle_scalar::from_witness(&builder, scalar_val);

    const size_t table_bits = 4;
    straus_scalar_slices slices(&builder, scalar, table_bits);

    // Read all slices and verify reconstruction
    uint64_t max_slice_val = (1ULL << table_bits) - 1;
    uint256_t reconstructed = 0;
    size_t i = 0;
    for (const auto [slice, slice_native] : zip_view(slices.slices, slices.slices_native)) {
        EXPECT_EQ(slice.get_value(), slice_native);
        EXPECT_LE(slice_native, max_slice_val);
        reconstructed += static_cast<uint256_t>(slice_native) << (i * table_bits);
        i++;
    }

    EXPECT_EQ(ScalarField(reconstructed), scalar_val);
    check_circuit_and_gate_count(builder, 51);
}
