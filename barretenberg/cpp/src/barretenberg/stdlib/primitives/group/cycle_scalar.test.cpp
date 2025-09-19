#include "barretenberg/stdlib/primitives/group/cycle_scalar.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/primitives/group/test_utils.hpp"
#include "barretenberg/stdlib/primitives/witness/witness.hpp"
#include "barretenberg/transcript/origin_tag.hpp"
#include <gtest/gtest.h>

using namespace bb;

namespace {
auto& engine = numeric::get_debug_randomness();
}

template <class Builder> class CycleScalarTest : public ::testing::Test {
  public:
    using field_t = stdlib::field_t<Builder>;
    using witness_t = stdlib::witness_t<Builder>;
    using cycle_scalar = stdlib::cycle_scalar<Builder>;
    using Curve = typename Builder::EmbeddedCurve;
    using ScalarField = typename Curve::ScalarField;
    using NativeField = typename Builder::FF;
};

using CircuitTypes = ::testing::Types<bb::UltraCircuitBuilder, bb::MegaCircuitBuilder>;
TYPED_TEST_SUITE(CycleScalarTest, CircuitTypes);

STANDARD_TESTING_TAGS

using bb::stdlib::test_utils::check_circuit_and_gate_count;

/**
 * @brief Test witness construction
 */
TYPED_TEST(CycleScalarTest, TestFromWitness)
{
    using cycle_scalar = typename TestFixture::cycle_scalar;
    using ScalarField = typename TestFixture::ScalarField;

    TypeParam builder;
    auto scalar_val = ScalarField::random_element(&engine);
    auto scalar = cycle_scalar::from_witness(&builder, scalar_val);

    EXPECT_EQ(scalar.get_value(), scalar_val);
    EXPECT_FALSE(scalar.is_constant());
    EXPECT_EQ(scalar.num_bits(), cycle_scalar::NUM_BITS);

    check_circuit_and_gate_count(builder, 0);
}

/**
 * @brief Test construction from uint256_t witness
 */
TYPED_TEST(CycleScalarTest, TestFromU256Witness)
{
    using cycle_scalar = typename TestFixture::cycle_scalar;
    using ScalarField = typename TestFixture::ScalarField;

    TypeParam builder;
    uint256_t value(123456789);
    auto scalar = cycle_scalar::from_u256_witness(&builder, value);

    EXPECT_EQ(scalar.get_value(), ScalarField(value));
    EXPECT_FALSE(scalar.is_constant());
    EXPECT_EQ(scalar.num_bits(), 256);

    check_circuit_and_gate_count(builder, 0);
}

/**
 * @brief Test lo/hi decomposition
 */
TYPED_TEST(CycleScalarTest, TestLoHiDecomposition)
{
    using cycle_scalar = typename TestFixture::cycle_scalar;
    using ScalarField = typename TestFixture::ScalarField;

    TypeParam builder;
    auto scalar_val = ScalarField::random_element(&engine);
    auto scalar = cycle_scalar::from_witness(&builder, scalar_val);

    // Check that lo and hi reconstruct to the original value
    uint256_t lo_val = uint256_t(scalar.lo.get_value());
    uint256_t hi_val = uint256_t(scalar.hi.get_value());
    uint256_t reconstructed = lo_val + (hi_val << cycle_scalar::LO_BITS);

    EXPECT_EQ(ScalarField(reconstructed), scalar_val);
    check_circuit_and_gate_count(builder, 0);
}

/**
 * @brief Test creation from bn254 scalar field element
 */
TYPED_TEST(CycleScalarTest, TestCreateFromBn254Scalar)
{
    using cycle_scalar = typename TestFixture::cycle_scalar;
    using ScalarField = typename TestFixture::ScalarField;
    using field_t = typename TestFixture::field_t;
    using NativeField = typename TestFixture::NativeField;

    TypeParam builder;
    auto native_val = NativeField::random_element(&engine);
    auto field_val = field_t::from_witness(&builder, native_val);

    auto scalar = cycle_scalar::create_from_bn254_scalar(field_val);

    EXPECT_EQ(scalar.get_value(), ScalarField(uint256_t(native_val)));
    EXPECT_FALSE(scalar.is_constant());
    EXPECT_TRUE(scalar.use_bn254_scalar_field_for_primality_test());

    check_circuit_and_gate_count(builder, 2762);
}

/**
 * @brief Test scalar field validation
 */
TYPED_TEST(CycleScalarTest, TestScalarFieldValidation)
{
    using cycle_scalar = typename TestFixture::cycle_scalar;
    using ScalarField = typename TestFixture::ScalarField;

    TypeParam builder;

    // Test with a valid scalar
    auto valid_scalar = ScalarField::random_element(&engine);
    auto scalar = cycle_scalar::from_witness(&builder, valid_scalar);
    scalar.validate_scalar_is_in_field();
    EXPECT_FALSE(builder.failed());

    check_circuit_and_gate_count(builder, 2761);
}

/**
 * @brief Test different bit lengths
 */
TYPED_TEST(CycleScalarTest, TestDifferentBitLengths)
{
    using cycle_scalar = typename TestFixture::cycle_scalar;
    using ScalarField = typename TestFixture::ScalarField;

    TypeParam builder;

    // Create scalar with 256 bits
    uint256_t value_256(0xFFFFFFFFFFFFFFFF);
    auto scalar_256 = cycle_scalar::from_u256_witness(&builder, value_256);
    EXPECT_EQ(scalar_256.num_bits(), 256);

    // Create scalar with default bits (254 for bn254/grumpkin)
    auto scalar_254 = cycle_scalar::from_witness(&builder, ScalarField::random_element(&engine));
    EXPECT_EQ(scalar_254.num_bits(), cycle_scalar::NUM_BITS);

    check_circuit_and_gate_count(builder, 0);
}
