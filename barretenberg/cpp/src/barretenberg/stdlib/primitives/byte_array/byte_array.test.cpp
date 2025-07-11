#include <gtest/gtest.h>

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/stdlib/primitives/bool/bool.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/primitives/witness/witness.hpp"
#include "barretenberg/transcript/origin_tag.hpp"
#include "byte_array.hpp"

#pragma GCC diagnostic ignored "-Wunused-local-typedefs"

using namespace bb;
using namespace bb::stdlib;
namespace {
auto& engine = numeric::get_debug_randomness();
}

#define STDLIB_TYPE_ALIASES                                                                                            \
    using Builder = TypeParam;                                                                                         \
    using witness_ct = witness_t<Builder>;                                                                             \
    using byte_array_ct = byte_array<Builder>;                                                                         \
    using field_ct = field_t<Builder>;                                                                                 \
    using bool_ct = bool_t<Builder>;

template <class Builder> class ByteArrayTest : public ::testing::Test {};

template <class Builder> using byte_array_ct = byte_array<Builder>;

using CircuitTypes = ::testing::Types<bb::UltraCircuitBuilder>;

STANDARD_TESTING_TAGS

TYPED_TEST_SUITE(ByteArrayTest, CircuitTypes);

TYPED_TEST(ByteArrayTest, test_reverse)
{
    STDLIB_TYPE_ALIASES
    auto builder = Builder();

    std::vector<uint8_t> expected = { 0x04, 0x03, 0x02, 0x01 };
    byte_array_ct arr(&builder, std::vector<uint8_t>{ 0x01, 0x02, 0x03, 0x04 });

    // Unset the free witness tag, so it doesn't interfere
    for (const auto& byte : arr.bytes()) {
        byte.unset_free_witness_tag();
    }

    // Set tag on the first byte
    arr.bytes()[0].set_origin_tag(submitted_value_origin_tag);

    auto reversed_arr = arr.reverse();

    EXPECT_EQ(arr.size(), 4UL);
    EXPECT_EQ(reversed_arr.get_value(), expected);
    // The tag is preserved in reverse
    EXPECT_EQ(reversed_arr.bytes()[3].get_origin_tag(), submitted_value_origin_tag);
    // A general tag contains this tag
    EXPECT_EQ(reversed_arr.get_origin_tag(), submitted_value_origin_tag);
    // Other bytes are untouched by the tag
    EXPECT_EQ(reversed_arr.bytes()[0].get_origin_tag(), clear_tag);
    EXPECT_EQ(reversed_arr.bytes()[1].get_origin_tag(), clear_tag);
    EXPECT_EQ(reversed_arr.bytes()[2].get_origin_tag(), clear_tag);
}

TYPED_TEST(ByteArrayTest, test_string_constructor)
{
    STDLIB_TYPE_ALIASES
    auto builder = Builder();

    std::string a = "ascii";
    byte_array_ct arr(&builder, a);
    EXPECT_EQ(arr.get_string(), a);
}

TYPED_TEST(ByteArrayTest, test_into_byte_decomposition)
{
    STDLIB_TYPE_ALIASES

    auto check_byte_decomposition = [](const byte_array_ct& arr, const field_ct& original_val) {
        STDLIB_TYPE_ALIASES
        size_t num_bytes = arr.size();
        fr reconstructed = 0;

        for (size_t i = 0; i < num_bytes; ++i) {
            auto byte = arr[i].get_value();
            reconstructed += byte * fr(uint256_t(1) << ((num_bytes - 1 - i) * 8));
        }
        EXPECT_TRUE(original_val.get_value() == reconstructed);
    };

    auto builder = Builder();

    field_ct test_val = witness_ct(&builder, fr::random_element());

    byte_array_ct arr(test_val, 32);

    check_byte_decomposition(arr, test_val);

    EXPECT_TRUE(CircuitChecker::check(builder));

    {
        // Produce a 256 bit value `x` such that the high limb of (r-1) - x is overflowing.
        uint256_t overflowing_value(fr::modulus + 100);

        test_val = witness_ct(&builder, overflowing_value);

        byte_array<Builder> failure_array(test_val, 32, overflowing_value);
        check_byte_decomposition(failure_array, test_val);

        EXPECT_FALSE(CircuitChecker::check(builder));
        EXPECT_TRUE(builder.err() == "byte_array: y_hi doesn't fit in 128 bits.");
    }

    {
        // Test the case when (r-1).lo - x.lo + 2^128 is not a 129 bit integer, i.e. is negative.
        Builder builder;
        uint256_t y_overlap_not_bit("0xcf9bb18d1ece5fd647afba497e7ea7a3d3bdb158855487614a97cd3d2a1954b2");
        test_val = witness_ct(&builder, y_overlap_not_bit);

        byte_array<Builder> failure_array(test_val, 32, y_overlap_not_bit);
        check_byte_decomposition(failure_array, test_val);

        EXPECT_FALSE(CircuitChecker::check(builder));
        EXPECT_TRUE(builder.err() == "byte_array: y_overlap is not a bit");
    }
}

TYPED_TEST(ByteArrayTest, test_ostream_operator)
{
    STDLIB_TYPE_ALIASES
    auto builder = Builder();

    std::string a = "\1\2\3a";
    byte_array_ct arr(&builder, a);
    std::ostringstream os;
    os << arr;
    EXPECT_EQ(os.str(), "[ 01 02 03 61 ]");
}

TYPED_TEST(ByteArrayTest, test_byte_array_input_output_consistency)
{
    STDLIB_TYPE_ALIASES
    auto builder = Builder();

    fr a_expected = fr::random_element();
    fr b_expected = fr::random_element();

    field_ct a = witness_ct(&builder, a_expected);
    a.set_origin_tag(submitted_value_origin_tag);
    field_ct b = witness_ct(&builder, b_expected);
    b.set_origin_tag(challenge_origin_tag);

    byte_array_ct arr(&builder);

    arr.write(byte_array_ct(a));
    arr.write(byte_array_ct(b));

    EXPECT_EQ(arr.size(), 64UL);

    field_ct a_result(arr.slice(0, 32));
    field_ct b_result(arr.slice(32));

    EXPECT_EQ(a_result.get_value(), a_expected);
    EXPECT_EQ(b_result.get_value(), b_expected);
    // Tags should be preserved through write and slice
    EXPECT_EQ(a_result.get_origin_tag(), submitted_value_origin_tag);
    EXPECT_EQ(b_result.get_origin_tag(), challenge_origin_tag);

    bool verified = CircuitChecker::check(builder);
    EXPECT_EQ(verified, true);
}

TYPED_TEST(ByteArrayTest, get_bit)
{
    STDLIB_TYPE_ALIASES
    auto builder = Builder();

    byte_array_ct arr(&builder, std::vector<uint8_t>{ 0x01, 0x02, 0x03, 0x04 });

    // Unset the free witness tag, so it doesn't interfere
    for (const auto& byte : arr.bytes()) {
        byte.unset_free_witness_tag();
    }

    // The order is little endian in bits and big-endian in bytes
    arr.bytes()[3].set_origin_tag(submitted_value_origin_tag);
    arr.bytes()[2].set_origin_tag(challenge_origin_tag);

    EXPECT_EQ(arr.get_bit(0).get_value(), false);
    EXPECT_EQ(arr.get_bit(1).get_value(), false);
    EXPECT_EQ(arr.get_bit(2).get_value(), true);
    EXPECT_EQ(arr.get_bit(3).get_value(), false);
    EXPECT_EQ(arr.get_bit(4).get_value(), false);
    EXPECT_EQ(arr.get_bit(5).get_value(), false);
    EXPECT_EQ(arr.get_bit(6).get_value(), false);
    EXPECT_EQ(arr.get_bit(7).get_value(), false);

    EXPECT_EQ(arr.get_bit(7).get_origin_tag(), submitted_value_origin_tag);

    EXPECT_EQ(arr.get_bit(8).get_value(), true);
    EXPECT_EQ(arr.get_bit(9).get_value(), true);
    EXPECT_EQ(arr.get_bit(10).get_value(), false);
    EXPECT_EQ(arr.get_bit(11).get_value(), false);
    EXPECT_EQ(arr.get_bit(12).get_value(), false);
    EXPECT_EQ(arr.get_bit(13).get_value(), false);
    EXPECT_EQ(arr.get_bit(14).get_value(), false);
    EXPECT_EQ(arr.get_bit(15).get_value(), false);

    EXPECT_EQ(arr.get_bit(15).get_origin_tag(), challenge_origin_tag);

    EXPECT_EQ(arr.size(), 4UL);

    bool proof_result = CircuitChecker::check(builder);
    EXPECT_EQ(proof_result, true);
}

TYPED_TEST(ByteArrayTest, set_bit)
{
    STDLIB_TYPE_ALIASES
    auto builder = Builder();

    byte_array_ct arr(&builder, std::vector<uint8_t>{ 0x01, 0x02, 0x03, 0x04 });

    // Unset the free witness tag, so it doesn't interfere
    for (const auto& byte : arr.bytes()) {
        byte.unset_free_witness_tag();
    }

    auto bit_0 = bool_ct(witness_ct(&builder, true));
    auto bit_16 = bool_ct(witness_ct(&builder, true));
    auto bit_18 = bool_ct(witness_ct(&builder, true));
    auto bit_19 = bool_ct(witness_ct(&builder, false));
    auto bit_24 = bool_ct(witness_ct(&builder, false));

    bit_18.set_origin_tag(submitted_value_origin_tag);
    bit_19.set_origin_tag(challenge_origin_tag);
    bit_0.unset_free_witness_tag();
    bit_16.unset_free_witness_tag();
    bit_24.unset_free_witness_tag();

    arr.set_bit(16, bit_16);
    arr.set_bit(18, bit_18);
    arr.set_bit(19, bit_19);
    arr.set_bit(24, bit_24);
    arr.set_bit(0, bit_0);

    // Tags are merged
    EXPECT_EQ(arr.bytes()[0].get_origin_tag(), clear_tag);
    EXPECT_EQ(arr.bytes()[1].get_origin_tag(), first_two_merged_tag);
    EXPECT_EQ(arr.bytes()[2].get_origin_tag(), clear_tag);
    EXPECT_EQ(arr.bytes()[3].get_origin_tag(), clear_tag);
    const auto out = arr.get_value();
    EXPECT_EQ(out[0], uint8_t(0));
    EXPECT_EQ(out[1], uint8_t(7));
    EXPECT_EQ(out[3], uint8_t(5));

    bool proof_result = CircuitChecker::check(builder);
    EXPECT_EQ(proof_result, true);
}
