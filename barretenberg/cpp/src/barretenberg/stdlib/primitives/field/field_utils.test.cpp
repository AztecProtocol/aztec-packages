#include "barretenberg/stdlib/primitives/field/field_utils.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include <gtest/gtest.h>

using namespace bb;

namespace {
template <typename Builder> class FieldUtilsTests : public ::testing::Test {
  public:
    using field_t = stdlib::field_t<Builder>;
    using native = typename field_t::native;
};

using CircuitTypes = ::testing::Types<bb::UltraCircuitBuilder, bb::MegaCircuitBuilder>;
} // namespace

TYPED_TEST_SUITE(FieldUtilsTests, CircuitTypes);

/**
 * @brief Test that validate_split_in_field_unsafe rejects value == modulus
 * @details This is a soundness bug: when lo + hi * 2^lo_bits == field_modulus,
 * both hi_diff and lo_diff equal 0, which passes the range checks but should be rejected.
 */
TYPED_TEST(FieldUtilsTests, ValidateSplitRejectsModulus)
{
    using Builder = TypeParam;
    using field_t = typename TestFixture::field_t;
    using native = typename TestFixture::native;

    Builder builder;
    constexpr size_t lo_bits = 128;

    // Construct a value equal to the bn254 scalar field modulus
    uint256_t modulus = native::modulus;
    uint256_t lo_val = modulus.slice(0, lo_bits);
    uint256_t hi_val = modulus.slice(lo_bits, 254);

    // Create field elements from these values
    auto lo = field_t::from_witness(&builder, native(lo_val));
    auto hi = field_t::from_witness(&builder, native(hi_val));

    // Verify the reconstruction equals the modulus
    uint256_t reconstructed = uint256_t(lo.get_value()) + (uint256_t(hi.get_value()) << lo_bits);
    EXPECT_EQ(reconstructed, modulus);

    // Call validate_split_in_field_unsafe with the modulus itself
    // This should create constraints that fail
    stdlib::validate_split_in_field_unsafe(lo, hi, lo_bits, modulus);

    // The circuit should fail because value == modulus is invalid
    EXPECT_FALSE(CircuitChecker::check(builder));
}

/**
 * @brief Test that validate_split_in_field_unsafe accepts modulus - 1
 * @details The maximum valid value should be field_modulus - 1
 */
TYPED_TEST(FieldUtilsTests, ValidateSplitAcceptsModulusMinusOne)
{
    using Builder = TypeParam;
    using field_t = typename TestFixture::field_t;
    using native = typename TestFixture::native;

    Builder builder;
    constexpr size_t lo_bits = 128;

    // Construct a value equal to the bn254 scalar field modulus - 1
    uint256_t modulus = native::modulus;
    uint256_t value = modulus - 1;
    uint256_t lo_val = value.slice(0, lo_bits);
    uint256_t hi_val = value.slice(lo_bits, 254);

    // Create field elements from these values
    auto lo = field_t::from_witness(&builder, native(lo_val));
    auto hi = field_t::from_witness(&builder, native(hi_val));

    // Verify the reconstruction equals modulus - 1
    uint256_t reconstructed = uint256_t(lo.get_value()) + (uint256_t(hi.get_value()) << lo_bits);
    EXPECT_EQ(reconstructed, value);

    // Call validate_split_in_field_unsafe
    // This should succeed because value < modulus
    stdlib::validate_split_in_field_unsafe(lo, hi, lo_bits, modulus);

    // The circuit should be valid
    EXPECT_FALSE(builder.failed());
    EXPECT_TRUE(CircuitChecker::check(builder));
}

/**
 * @brief Test that split_unique rejects value == modulus
 */
TYPED_TEST(FieldUtilsTests, SplitUniqueRejectsModulus)
{
    using Builder = TypeParam;
    using field_t = typename TestFixture::field_t;
    using native = typename TestFixture::native;

    Builder builder;
    constexpr size_t lo_bits = 128;

    // Create a field element that represents 0 (which is equivalent to modulus in field arithmetic)
    // In the native field, we can't directly create a witness with value == modulus
    // because it gets reduced to 0. So we test the edge case by using 0.
    auto field = field_t::from_witness(&builder, native(0));

    // Split it
    auto [lo, hi] = stdlib::split_unique(field, lo_bits);

    // Both lo and hi should be 0 for value 0
    EXPECT_EQ(uint256_t(lo.get_value()), uint256_t(0));
    EXPECT_EQ(uint256_t(hi.get_value()), uint256_t(0));

    // The circuit should be valid for 0 (the canonical representation)
    EXPECT_FALSE(builder.failed());
    EXPECT_TRUE(CircuitChecker::check(builder));
}

/**
 * @brief Test split_unique with maximum valid value
 */
TYPED_TEST(FieldUtilsTests, SplitUniqueMaxValue)
{
    using Builder = TypeParam;
    using field_t = typename TestFixture::field_t;
    using native = typename TestFixture::native;

    Builder builder;
    constexpr size_t lo_bits = 128;

    // Create a field element with the maximum value (modulus - 1)
    // This is represented as -1 in the field
    auto field = field_t::from_witness(&builder, -native(1));

    // Split it
    auto [lo, hi] = stdlib::split_unique(field, lo_bits);

    // Verify reconstruction
    uint256_t lo_val = uint256_t(lo.get_value());
    uint256_t hi_val = uint256_t(hi.get_value());
    uint256_t reconstructed = lo_val + (hi_val << lo_bits);
    uint256_t expected = uint256_t(native::modulus) - 1;

    EXPECT_EQ(reconstructed, expected);

    // The circuit should be valid
    EXPECT_FALSE(builder.failed());
    EXPECT_TRUE(CircuitChecker::check(builder));
}

/**
 * @brief Test validate_split_in_field_unsafe rejects modulus with constant lo and witness hi
 * @details Regression test for audit finding: when lo is constant but hi is a witness,
 * the borrow value must still be constrained to be boolean. Previously, the range constraint
 * was skipped if lo was constant, allowing malicious provers to use non-boolean borrow values
 * to bypass the field validation check.
 */
TYPED_TEST(FieldUtilsTests, ValidateSplitConstantLoWitnessHiRejectsModulus)
{
    using Builder = TypeParam;
    using field_t = typename TestFixture::field_t;
    using native = typename TestFixture::native;

    Builder builder;
    constexpr size_t lo_bits = 128;

    // Use value == modulus (should be rejected)
    uint256_t modulus = native::modulus;
    uint256_t lo_val = modulus.slice(0, lo_bits);
    uint256_t hi_val = modulus.slice(lo_bits, 254);

    // Create constant lo and witness hi
    auto lo = field_t(native(lo_val));                         // constant
    auto hi = field_t::from_witness(&builder, native(hi_val)); // witness

    // Verify the setup
    EXPECT_TRUE(lo.is_constant());
    EXPECT_FALSE(hi.is_constant());

    // Call validate_split_in_field_unsafe with value == modulus
    stdlib::validate_split_in_field_unsafe(lo, hi, lo_bits, modulus);

    // The circuit should FAIL because value == modulus is invalid
    EXPECT_FALSE(CircuitChecker::check(builder));
}

/**
 * @brief Test validate_split_in_field_unsafe rejects modulus with witness lo and constant hi
 * @details Symmetric case to the above test.
 */
TYPED_TEST(FieldUtilsTests, ValidateSplitWitnessLoConstantHiRejectsModulus)
{
    using Builder = TypeParam;
    using field_t = typename TestFixture::field_t;
    using native = typename TestFixture::native;

    Builder builder;
    constexpr size_t lo_bits = 128;

    // Use value == modulus (should be rejected)
    uint256_t modulus = native::modulus;
    uint256_t lo_val = modulus.slice(0, lo_bits);
    uint256_t hi_val = modulus.slice(lo_bits, 254);

    // Create witness lo and constant hi
    auto lo = field_t::from_witness(&builder, native(lo_val)); // witness
    auto hi = field_t(native(hi_val));                         // constant

    // Verify the setup
    EXPECT_FALSE(lo.is_constant());
    EXPECT_TRUE(hi.is_constant());

    // Call validate_split_in_field_unsafe with value == modulus
    stdlib::validate_split_in_field_unsafe(lo, hi, lo_bits, modulus);

    // The circuit should FAIL because value == modulus is invalid
    EXPECT_FALSE(CircuitChecker::check(builder));
}
