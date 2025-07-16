#include <gtest/gtest.h>

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "byte_array.hpp"

#pragma GCC diagnostic ignored "-Wunused-local-typedefs"

using namespace bb;
using namespace bb::stdlib;
namespace {
auto& engine = numeric::get_debug_randomness();
}
STANDARD_TESTING_TAGS

template <class Builder> class ByteArrayTest : public ::testing::Test {
  public:
    using field_ct = stdlib::field_t<Builder>;
    using witness_ct = stdlib::witness_t<Builder>;
    using bool_ct = stdlib::bool_t<Builder>;
    using byte_array_ct = stdlib::byte_array<Builder>;

    void check_byte_decomposition(const byte_array_ct& arr, const field_ct& original_val)
    {
        size_t num_bytes = arr.size();
        fr reconstructed = 0;

        for (size_t i = 0; i < num_bytes; ++i) {
            auto byte = arr[i].get_value();
            reconstructed += byte * fr(uint256_t(1) << ((num_bytes - 1 - i) * 8));
        }
        EXPECT_TRUE(original_val.get_value() == reconstructed);
    };

    void test_reverse()
    {
        Builder builder;

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

    void test_from_string_constructor()
    {
        Builder builder;

        std::string a = "ascii";
        byte_array_ct arr(&builder, a);
        EXPECT_EQ(arr.get_string(), a);
    }

    void test_into_bytes_decomposition_32_bytes()
    {

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
            uint256_t random_overflowing_value("0xcf9bb18d1ece5fd647afba497e7ea7a3d3bdb158855487614a97cd3d2a1954b2");
            test_val = witness_ct(&builder, random_overflowing_value);

            byte_array<Builder> failure_array(test_val, 32, random_overflowing_value);
            check_byte_decomposition(failure_array, test_val);

            EXPECT_FALSE(CircuitChecker::check(builder));
            EXPECT_TRUE(builder.err() == "byte_array: y_hi doesn't fit in 128 bits.");
        }
    }

    void test_into_bytes_decomposition_32_bytes_const()
    {

        Builder builder;
        size_t gates_start = builder.get_estimated_num_finalized_gates();
        field_ct test_val(&builder, fr::random_element());

        byte_array_ct arr(test_val, 32);

        check_byte_decomposition(arr, test_val);

        {
            // Produce a 256 bit value `x` such that the high limb of (r-1) - x is overflowing.
            uint256_t overflowing_value(fr::modulus + 100);

            test_val = field_ct(&builder, bb::fr(overflowing_value));
#ifndef NDEBUG
            EXPECT_DEATH(byte_array<Builder> failure_array(test_val, 32, overflowing_value),
                         "byte_array: y_hi doesn't fit in 128 bits");
#endif
        }

        {
            // Test the case when (r-1).lo - x.lo + 2^128 is not a 129 bit integer, i.e. is negative.
            uint256_t random_overflowing_value("0xcf9bb18d1ece5fd647afba497e7ea7a3d3bdb158855487614a97cd3d2a1954b2");
            test_val = field_ct(&builder, bb::fr(random_overflowing_value));
#ifndef NDEBUG
            EXPECT_DEATH(byte_array<Builder> failure_array(test_val, 32, random_overflowing_value),
                         "byte_array: y_hi doesn't fit in 128 bits");
#endif
        }
        // Make sure no gates are added
        EXPECT_TRUE(gates_start == builder.get_estimated_num_finalized_gates());
    }

    void test_byte_array_input_output_consistency()
    {
        Builder builder;

        auto slice_to_31_bytes = [](const fr& value) {
            uint256_t val(value);
            uint256_t mask = (uint256_t(1) << 248) - 1; // lower 248 bits
            return fr(val & mask);
        };

        uint256_t a_expected = engine.get_random_uint256();
        uint256_t b_expected = engine.get_random_uint256();

        field_ct a = witness_ct(&builder, slice_to_31_bytes(a_expected));
        a.set_origin_tag(submitted_value_origin_tag);
        field_ct b = witness_ct(&builder, slice_to_31_bytes(b_expected));
        b.set_origin_tag(challenge_origin_tag);

        byte_array_ct arr(&builder);

        arr.write(byte_array_ct(a, 31));
        arr.write(byte_array_ct(b, 31));

        EXPECT_EQ(arr.size(), 62UL);

        field_ct a_result(arr.slice(0, 31));
        field_ct b_result(arr.slice(31));

        EXPECT_EQ(a_result.get_value(), slice_to_31_bytes(a_expected));
        EXPECT_EQ(b_result.get_value(), slice_to_31_bytes(b_expected));
        // Tags should be preserved through write and slice
        EXPECT_EQ(a_result.get_origin_tag(), submitted_value_origin_tag);
        EXPECT_EQ(b_result.get_origin_tag(), challenge_origin_tag);

        bool verified = CircuitChecker::check(builder);
        EXPECT_EQ(verified, true);
    }

    void test_conversion_to_field()
    {
        for (size_t arr_length = 1; arr_length < 32; arr_length++) {

            Builder builder;
            byte_array_ct test_array(&builder, arr_length);

            std::vector<uint8_t> native_bytes(arr_length);
            for (size_t idx = 0; idx < arr_length; idx++) {
                uint8_t byte = engine.get_random_uint8();
                native_bytes[idx] = byte;
                test_array[idx] = witness_ct(&builder, byte);
            }

            // Convert to field_t using the byte_array conversion
            field_ct represented_field_elt = static_cast<field_ct>(test_array);

            // Compute the expected value manually (big-endian)
            uint256_t expected_value = 0;
            for (size_t i = 0; i < arr_length; ++i) {
                expected_value = (expected_value << 8) + native_bytes[i];
            }

            // Assert values match
            EXPECT_EQ(represented_field_elt.get_value(), fr(expected_value));

            // Check that the circuit is valid
            bool result = CircuitChecker::check(builder);
            EXPECT_TRUE(result);
        }
    }

    void test_ostream_operator()
    {
        Builder builder;

        std::string a = "\1\2\3a";
        byte_array_ct arr(&builder, a);
        std::ostringstream os;
        os << arr;
        EXPECT_EQ(os.str(), "[ 01 02 03 61 ]");
    }
};

using CircuitTypes = ::testing::Types<bb::UltraCircuitBuilder>;

TYPED_TEST_SUITE(ByteArrayTest, CircuitTypes);

TYPED_TEST(ByteArrayTest, Reverse)
{
    TestFixture::test_reverse();
}

TYPED_TEST(ByteArrayTest, ConstructFromString)
{
    TestFixture::test_from_string_constructor();
}

TYPED_TEST(ByteArrayTest, ByteDecomposition32Bytes)
{
    TestFixture::test_into_bytes_decomposition_32_bytes();
}

TYPED_TEST(ByteArrayTest, ByteDecomposition32BytesConst)
{
    TestFixture::test_into_bytes_decomposition_32_bytes_const();
}

TYPED_TEST(ByteArrayTest, InputOutputConsistency)
{
    TestFixture::test_byte_array_input_output_consistency();
}

TYPED_TEST(ByteArrayTest, ConvertToField)
{
    TestFixture::test_conversion_to_field();
}

TYPED_TEST(ByteArrayTest, OstreamOperator)
{
    TestFixture::test_ostream_operator();
}
