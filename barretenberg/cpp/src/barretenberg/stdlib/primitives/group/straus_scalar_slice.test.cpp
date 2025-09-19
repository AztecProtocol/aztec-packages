#include "barretenberg/stdlib/primitives/group/straus_scalar_slice.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_scalar.hpp"
#include "barretenberg/stdlib/primitives/group/test_utils.hpp"
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
    using straus_scalar_slice = stdlib::straus_scalar_slice<Builder>;
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
    using straus_scalar_slice = typename TestFixture::straus_scalar_slice;
    using ScalarField = typename TestFixture::ScalarField;

    Builder builder;

    auto scalar_val = ScalarField::random_element(&engine);
    auto scalar = cycle_scalar::from_witness(&builder, scalar_val);

    const size_t table_bits = 4;
    straus_scalar_slice slices(&builder, scalar, table_bits);

    // Read all slices and verify reconstruction
    uint256_t reconstructed = 0;
    for (size_t i = 0; i < slices.slices.size(); i++) {
        auto slice_val = slices.read(i);
        uint256_t slice_native = uint256_t(slice_val.get_value());
        reconstructed += slice_native << (i * table_bits);
    }

    // Mask to the actual number of bits
    uint256_t mask = (uint256_t(1) << cycle_scalar::NUM_BITS) - 1;
    reconstructed &= mask;

    EXPECT_EQ(ScalarField(reconstructed), scalar_val);
    check_circuit_and_gate_count(builder, 51);
}

/**
 * @brief Test with different table bit sizes
 */
TYPED_TEST(StrausScalarSliceTest, TestDifferentTableBitSizes)
{
    using Builder = TypeParam;
    using cycle_scalar = typename TestFixture::cycle_scalar;
    using straus_scalar_slice = typename TestFixture::straus_scalar_slice;
    using ScalarField = typename TestFixture::ScalarField;

    Builder builder;

    auto scalar_val = ScalarField::random_element(&engine);
    auto scalar = cycle_scalar::from_witness(&builder, scalar_val);

    // Test with various table bit sizes
    std::vector<size_t> table_bit_sizes = { 1, 2, 3, 4, 5, 8 };

    for (size_t table_bits : table_bit_sizes) {
        straus_scalar_slice slices(&builder, scalar, table_bits);

        // Verify each slice is within the correct range
        uint64_t max_slice_val = (1ULL << table_bits) - 1;
        for (size_t i = 0; i < slices.slices.size(); i++) {
            uint64_t slice_val = slices.slices_native[i];
            EXPECT_LE(slice_val, max_slice_val);
        }
    }

    check_circuit_and_gate_count(builder, 457);
}

/**
 * @brief Test slicing with single-bit windows (binary decomposition)
 */
TYPED_TEST(StrausScalarSliceTest, TestBinaryDecomposition)
{
    using Builder = TypeParam;
    using cycle_scalar = typename TestFixture::cycle_scalar;
    using straus_scalar_slice = typename TestFixture::straus_scalar_slice;
    using ScalarField = typename TestFixture::ScalarField;

    Builder builder;

    auto scalar_val = ScalarField::random_element(&engine);
    auto scalar = cycle_scalar::from_witness(&builder, scalar_val);

    const size_t table_bits = 1; // Binary decomposition
    straus_scalar_slice slices(&builder, scalar, table_bits);

    // Each slice should be 0 or 1
    for (size_t i = 0; i < slices.slices.size(); i++) {
        uint64_t slice_val = slices.slices_native[i];
        EXPECT_TRUE(slice_val == 0 || slice_val == 1);
    }

    // Reconstruct and verify
    uint256_t reconstructed = 0;
    uint256_t scalar_native = uint256_t(scalar_val);
    for (size_t i = 0; i < cycle_scalar::NUM_BITS; i++) {
        if (i < slices.slices.size()) {
            bool bit = slices.slices_native[i] == 1;
            if (bit) {
                reconstructed += uint256_t(1) << i;
            }

            // Check against the actual bit in the scalar
            bool expected_bit = ((scalar_native >> i) & 1) == 1;
            EXPECT_EQ(bit, expected_bit);
        }
    }

    check_circuit_and_gate_count(builder, 153);
}
