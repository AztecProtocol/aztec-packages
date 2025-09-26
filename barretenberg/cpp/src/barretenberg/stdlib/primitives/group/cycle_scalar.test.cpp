#include "barretenberg/stdlib/primitives/group/cycle_scalar.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/primitives/test_utils.hpp"
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

    // Check that lo and hi reconstruct to the original value
    uint256_t lo_val = uint256_t(scalar.lo.get_value());
    uint256_t hi_val = uint256_t(scalar.hi.get_value());
    uint256_t reconstructed = lo_val + (hi_val << cycle_scalar::LO_BITS);

    EXPECT_EQ(ScalarField(reconstructed), scalar_val);

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

    // Check that lo and hi reconstruct to the original value
    uint256_t lo_val = uint256_t(scalar.lo.get_value());
    uint256_t hi_val = uint256_t(scalar.hi.get_value());
    uint256_t reconstructed = lo_val + (hi_val << cycle_scalar::LO_BITS);

    EXPECT_EQ(reconstructed, value);

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

    // Check that lo and hi reconstruct to the original value
    uint256_t lo_val = uint256_t(scalar.lo.get_value());
    uint256_t hi_val = uint256_t(scalar.hi.get_value());
    uint256_t reconstructed = lo_val + (hi_val << cycle_scalar::LO_BITS);

    EXPECT_EQ(NativeField(reconstructed), field_val.get_value());

    check_circuit_and_gate_count(builder, 2762);
}

/**
 * @brief Test cycle_scalar construction from BigScalarField
 */
TYPED_TEST(CycleScalarTest, TestBigScalarFieldConstructor)
{
    using cycle_scalar = typename TestFixture::cycle_scalar;
    using ScalarField = typename TestFixture::ScalarField;
    using BigScalarField = typename cycle_scalar::BigScalarField;

    // Test with a witness BigScalarField
    {
        TypeParam builder;

        auto value = ScalarField::random_element(&engine);
        auto big_scalar = BigScalarField::from_witness(&builder, value);
        cycle_scalar scalar(big_scalar);

        EXPECT_EQ(scalar.get_value(), value);
        EXPECT_FALSE(scalar.is_constant());

        // Verify lo/hi decomposition matches
        uint256_t lo_val = uint256_t(scalar.lo.get_value());
        uint256_t hi_val = uint256_t(scalar.hi.get_value());
        uint256_t reconstructed = lo_val + (hi_val << cycle_scalar::LO_BITS);
        EXPECT_EQ(ScalarField(reconstructed), value);

        check_circuit_and_gate_count(builder, 3498);
    }

    // Test with constant BigScalarField
    {
        TypeParam builder;

        uint256_t value(0x123456789ABCDEF);
        BigScalarField big_scalar(&builder, value);
        cycle_scalar scalar(big_scalar);

        EXPECT_EQ(scalar.get_value(), ScalarField(value));
        EXPECT_TRUE(scalar.is_constant());

        // Verify lo/hi decomposition matches
        uint256_t lo_val = uint256_t(scalar.lo.get_value());
        uint256_t hi_val = uint256_t(scalar.hi.get_value());
        uint256_t reconstructed = lo_val + (hi_val << cycle_scalar::LO_BITS);
        EXPECT_EQ(ScalarField(reconstructed), value);

        check_circuit_and_gate_count(builder, 0);
    }
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
 * @brief Test expected scalar field validation failure with value between Grumpkin and BN254 moduli
 *
 * This test creates a scalar with hi/lo decomposition that results in a value greater than BN254::fr modulus but less
 * than BN254::fq modulus. (We construct the scalar directly from lo/hi components to bypass field reduction).
 * We demonstrate that validation against Grumpkin scalar field (fq) passes, but validation against BN254 scalar field
 * (fr) fails, as expected.
 */
TYPED_TEST(CycleScalarTest, TestScalarFieldValidationFailureBetweenModuli)
{
    using cycle_scalar = typename TestFixture::cycle_scalar;
    using field_t = typename TestFixture::field_t;
    using NativeField = typename TestFixture::NativeField;

    // Create a value that is between BN254::fr modulus and BN254::fq modulus
    // BN254::fr modulus = 0x30644E72E131A029B85045B68181585D2833E84879B9709143E1F593F0000001
    // BN254::fq modulus = 0x30644E72E131A029B85045B68181585D97816A916871CA8D3C208C16D87CFD47
    uint256_t bn254_fr_modulus = bb::fr::modulus;
    uint256_t bn254_fq_modulus = bb::fq::modulus;
    uint256_t moduli_diff = bn254_fq_modulus - bn254_fr_modulus;
    uint256_t value_between_moduli = bn254_fr_modulus + moduli_diff / 2;

    // Split the value into lo and hi components at the LO_BITS boundary
    uint256_t lo_val = value_between_moduli.slice(0, cycle_scalar::LO_BITS);
    uint256_t hi_val = value_between_moduli.slice(cycle_scalar::LO_BITS, 256);

    // Test 1: Validate with Grumpkin scalar field (larger modulus) - should pass
    {
        TypeParam builder;

        // Create lo and hi field elements
        auto lo = field_t::from_witness(&builder, NativeField(lo_val));
        auto hi = field_t::from_witness(&builder, NativeField(hi_val));

        // Construct cycle_scalar directly WITHOUT BN254 scalar field validation flag
        auto scalar = cycle_scalar(lo, hi);

        // This should NOT use BN254 scalar field for primality test
        EXPECT_FALSE(scalar.use_bn254_scalar_field_for_primality_test());

        // Validate - this should pass because value < BN254::fq modulus (Grumpkin scalar field)
        scalar.validate_scalar_is_in_field();

        // The builder should NOT have failed
        EXPECT_FALSE(builder.failed());
        check_circuit_and_gate_count(builder, 2761);
    }

    // Test 2: Validate with BN254 scalar field (smaller modulus)
    // Note: Since we can't set the use_bn254_scalar_field_for_primality_test flag directly with the public constructor,
    // we'll test the underlying validate_split_in_field directly to achieve what would be achieved internally
    {
        TypeParam builder;

        // Create lo and hi field elements
        auto lo = field_t::from_witness(&builder, NativeField(lo_val));
        auto hi = field_t::from_witness(&builder, NativeField(hi_val));

        // Construct cycle_scalar with the public constructor
        auto scalar = cycle_scalar(lo, hi);

        // Verify the reconstructed value matches what we expect
        uint256_t reconstructed =
            uint256_t(scalar.lo.get_value()) + (uint256_t(scalar.hi.get_value()) << cycle_scalar::LO_BITS);
        EXPECT_EQ(reconstructed, value_between_moduli);

        // Now directly call validate_split_in_field with BN254::fr modulus
        // This should create unsatisfied constraints because value > BN254::fr modulus
        bb::stdlib::validate_split_in_field(lo, hi, cycle_scalar::LO_BITS, bn254_fr_modulus);

        // The builder should have failed
        EXPECT_TRUE(builder.failed());
    }
}

/**
 * @brief Test BigScalarField constructor with edge case values
 *
 */
TYPED_TEST(CycleScalarTest, TestBigScalarFieldConstructorEdgeCases)
{
    using cycle_scalar = typename TestFixture::cycle_scalar;
    using ScalarField = typename TestFixture::ScalarField;
    using BigScalarField = typename cycle_scalar::BigScalarField;

    // Test case 1: BigScalarField with zero value
    {
        TypeParam builder;
        BigScalarField zero_scalar = BigScalarField::from_witness(&builder, uint256_t(0));
        cycle_scalar scalar(zero_scalar);

        EXPECT_EQ(scalar.get_value(), ScalarField(0));
        EXPECT_EQ(scalar.lo.get_value(), 0);
        EXPECT_EQ(scalar.hi.get_value(), 0);

        check_circuit_and_gate_count(builder, 3498);
    }

    // Test case 2: BigScalarField with only first limb set (value < 2^68)
    {
        TypeParam builder;
        uint256_t small_value = uint256_t(0x12345678);
        BigScalarField small_scalar = BigScalarField::from_witness(&builder, small_value);
        cycle_scalar scalar(small_scalar);

        EXPECT_EQ(scalar.get_value(), ScalarField(small_value));
        EXPECT_EQ(scalar.lo.get_value(), small_value);
        EXPECT_EQ(scalar.hi.get_value(), 0);

        check_circuit_and_gate_count(builder, 3498);
    }

    // Test case 3: BigScalarField with value exactly at first limb boundary (2^68)
    {
        TypeParam builder;
        uint256_t limb_boundary = uint256_t(1) << 68;
        BigScalarField boundary_scalar = BigScalarField::from_witness(&builder, limb_boundary);
        cycle_scalar scalar(boundary_scalar);

        EXPECT_EQ(scalar.get_value(), ScalarField(limb_boundary));

        check_circuit_and_gate_count(builder, 3498);
    }

    // Test case 4: BigScalarField with value that puts zero in limb1
    // Value in range [2^68, 2^68 + 2^67] will have limb0 full and limb1 = 0
    {
        TypeParam builder;
        uint256_t limb0_full = (uint256_t(1) << 68) - 1; // Max value for limb0
        BigScalarField limb0_full_scalar = BigScalarField::from_witness(&builder, limb0_full);
        cycle_scalar scalar(limb0_full_scalar);

        EXPECT_EQ(scalar.get_value(), ScalarField(limb0_full));

        check_circuit_and_gate_count(builder, 3498);
    }

    // Test case 5: BigScalarField with value exactly 2^136 (limb0=0, limb1=0, limb2=1)
    {
        TypeParam builder;
        uint256_t val_136 = uint256_t(1) << 136; // limb0=0, limb1=0, limb2=1
        BigScalarField val_136_scalar = BigScalarField::from_witness(&builder, val_136);
        cycle_scalar scalar(val_136_scalar);

        EXPECT_EQ(scalar.get_value(), ScalarField(val_136));

        check_circuit_and_gate_count(builder, 3498);
    }

    // Test case 6: BigScalarField with value that genuinely has limb1 = 0
    // Value = 2^136 + small_value (so limb0=small, limb1=0, limb2=1)
    {
        TypeParam builder;
        uint256_t special_value = (uint256_t(1) << 136) + 0x42;
        BigScalarField special_scalar = BigScalarField::from_witness(&builder, special_value);
        cycle_scalar scalar(special_scalar);

        EXPECT_EQ(scalar.get_value(), ScalarField(special_value));

        check_circuit_and_gate_count(builder, 3498);
    }

    // Test case 7: BigScalarField where limb0 exceeds NUM_LIMB_BITS after addition
    // This triggers the overflow handling path in the constructor
    {
        TypeParam builder;
        // Create two BigScalarFields that when added will cause limb0.maximum_value > DEFAULT_MAXIMUM_LIMB
        uint256_t val1 = (uint256_t(1) << 67) - 1; // Almost full first limb
        uint256_t val2 = (uint256_t(1) << 67) - 1; // Another almost full first limb

        BigScalarField scalar1 = BigScalarField::from_witness(&builder, val1);
        BigScalarField scalar2 = BigScalarField::from_witness(&builder, val2);

        // Add them together - this will make limb0.maximum_value = 2 * ((2^67) - 1) > 2^68 - 1
        BigScalarField sum = scalar1 + scalar2;

        // Verify that limb0's maximum_value exceeds the default maximum
        EXPECT_GT(sum.binary_basis_limbs[0].maximum_value, BigScalarField::DEFAULT_MAXIMUM_LIMB);

        // Now construct a cycle_scalar from this sum - this should trigger the overflow handling
        cycle_scalar scalar(sum);

        // Verify the result is correct
        uint256_t expected = val1 + val2;
        EXPECT_EQ(scalar.get_value(), ScalarField(expected));

        // Extra gates due to a self reduction of the bigfield input
        check_circuit_and_gate_count(builder, 3555);
    }
}
