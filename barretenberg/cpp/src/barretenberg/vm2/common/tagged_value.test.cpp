#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"
#include "barretenberg/vm2/common/uint1.hpp"

namespace bb::avm2 {
namespace {

// Test constructor and basic properties for each supported type
TEST(TaggedValueTest, ConstructorAndTypeProperties)
{
    // Test uint1_t
    auto val_u1 = TaggedValue::from<uint1_t>(true);
    EXPECT_EQ(val_u1.get_tag(), ValueTag::U1);
    EXPECT_EQ(val_u1.as<uint1_t>().value(), 1);

    // Test uint8_t
    auto val_u8 = TaggedValue::from<uint8_t>(42);
    EXPECT_EQ(val_u8.get_tag(), ValueTag::U8);
    EXPECT_EQ(val_u8.as<uint8_t>(), 42);

    // Test uint16_t
    auto val_u16 = TaggedValue::from<uint16_t>(1000);
    EXPECT_EQ(val_u16.get_tag(), ValueTag::U16);
    EXPECT_EQ(val_u16.as<uint16_t>(), 1000);

    // Test uint32_t
    auto val_u32 = TaggedValue::from<uint32_t>(100000);
    EXPECT_EQ(val_u32.get_tag(), ValueTag::U32);
    EXPECT_EQ(val_u32.as<uint32_t>(), 100000);

    // Test uint64_t
    auto val_u64 = TaggedValue::from<uint64_t>(1ULL << 40);
    EXPECT_EQ(val_u64.get_tag(), ValueTag::U64);
    EXPECT_EQ(val_u64.as<uint64_t>(), 1ULL << 40);

    // Test uint128_t
    auto val_u128 = TaggedValue::from<uint128_t>(uint128_t(1) << 100);
    EXPECT_EQ(val_u128.get_tag(), ValueTag::U128);
    EXPECT_EQ(val_u128.as<uint128_t>(), uint128_t(1) << 100);

    // Test FF
    auto val_ff = TaggedValue::from<FF>(123);
    EXPECT_EQ(val_ff.get_tag(), ValueTag::FF);
    EXPECT_EQ(val_ff.as<FF>(), FF(123));
}

// Test from_tag method
TEST(TaggedValueTest, FromTag)
{
    FF value = 42;

    auto val_u1 = TaggedValue::from_tag(ValueTag::U1, 1);
    EXPECT_EQ(val_u1.get_tag(), ValueTag::U1);
    EXPECT_EQ(val_u1.as<uint1_t>().value(), 1);

    auto val_u1_zero = TaggedValue::from_tag(ValueTag::U1, 0);
    EXPECT_EQ(val_u1_zero.get_tag(), ValueTag::U1);
    EXPECT_EQ(val_u1_zero.as<uint1_t>().value(), 0);

    auto val_u8 = TaggedValue::from_tag(ValueTag::U8, value);
    EXPECT_EQ(val_u8.get_tag(), ValueTag::U8);
    EXPECT_EQ(val_u8.as<uint8_t>(), 42);

    auto val_u16 = TaggedValue::from_tag(ValueTag::U16, value);
    EXPECT_EQ(val_u16.get_tag(), ValueTag::U16);
    EXPECT_EQ(val_u16.as<uint16_t>(), 42);

    auto val_u32 = TaggedValue::from_tag(ValueTag::U32, value);
    EXPECT_EQ(val_u32.get_tag(), ValueTag::U32);
    EXPECT_EQ(val_u32.as<uint32_t>(), 42);

    auto val_u64 = TaggedValue::from_tag(ValueTag::U64, value);
    EXPECT_EQ(val_u64.get_tag(), ValueTag::U64);
    EXPECT_EQ(val_u64.as<uint64_t>(), 42);

    auto val_u128 = TaggedValue::from_tag(ValueTag::U128, value);
    EXPECT_EQ(val_u128.get_tag(), ValueTag::U128);
    EXPECT_EQ(val_u128.as<uint128_t>(), 42);

    auto val_ff = TaggedValue::from_tag(ValueTag::FF, value);
    EXPECT_EQ(val_ff.get_tag(), ValueTag::FF);
    EXPECT_EQ(val_ff.as<FF>(), value);
}

// Test from_tag_truncating method
TEST(TaggedValueTest, FromTagTruncating)
{
    // U1 - truncates to 1 bit
    auto val_u1 = TaggedValue::from_tag_truncating(ValueTag::U1, 3); // 3 = 1 mod 2
    EXPECT_EQ(val_u1.get_tag(), ValueTag::U1);
    EXPECT_EQ(val_u1.as<uint1_t>().value(), 1);

    auto val_u1_zero = TaggedValue::from_tag_truncating(ValueTag::U1, 0);
    EXPECT_EQ(val_u1_zero.get_tag(), ValueTag::U1);
    EXPECT_EQ(val_u1_zero.as<uint1_t>().value(), 0);

    // U8 - truncates to 8 bits
    auto val_u8 = TaggedValue::from_tag_truncating(ValueTag::U8, 42);
    EXPECT_EQ(val_u8.get_tag(), ValueTag::U8);
    EXPECT_EQ(val_u8.as<uint8_t>(), 42);

    auto val_u8_truncated = TaggedValue::from_tag_truncating(ValueTag::U8, 300); // 300 = 44 mod 256
    EXPECT_EQ(val_u8_truncated.get_tag(), ValueTag::U8);
    EXPECT_EQ(val_u8_truncated.as<uint8_t>(), 44);

    // U16 - truncates to 16 bits
    auto val_u16 = TaggedValue::from_tag_truncating(ValueTag::U16, 1000);
    EXPECT_EQ(val_u16.get_tag(), ValueTag::U16);
    EXPECT_EQ(val_u16.as<uint16_t>(), 1000);

    auto val_u16_truncated = TaggedValue::from_tag_truncating(ValueTag::U16, 70000); // 70000 = 4464 mod 65536
    EXPECT_EQ(val_u16_truncated.get_tag(), ValueTag::U16);
    EXPECT_EQ(val_u16_truncated.as<uint16_t>(), 4464);

    // U32 - truncates to 32 bits
    auto val_u32 = TaggedValue::from_tag_truncating(ValueTag::U32, 100000);
    EXPECT_EQ(val_u32.get_tag(), ValueTag::U32);
    EXPECT_EQ(val_u32.as<uint32_t>(), 100000);

    FF large_u32 = FF(uint256_t(1) << 33) + FF(42); // 2^33 + 42 = 42 mod 2^32
    auto val_u32_truncated = TaggedValue::from_tag_truncating(ValueTag::U32, large_u32);
    EXPECT_EQ(val_u32_truncated.get_tag(), ValueTag::U32);
    EXPECT_EQ(val_u32_truncated.as<uint32_t>(), 42);

    // U64 - truncates to 64 bits
    auto val_u64 = TaggedValue::from_tag_truncating(ValueTag::U64, 1ULL << 40);
    EXPECT_EQ(val_u64.get_tag(), ValueTag::U64);
    EXPECT_EQ(val_u64.as<uint64_t>(), 1ULL << 40);

    FF large_u64 = FF(uint256_t(1) << 65) + FF(123); // 2^65 + 123 = 123 mod 2^64
    auto val_u64_truncated = TaggedValue::from_tag_truncating(ValueTag::U64, large_u64);
    EXPECT_EQ(val_u64_truncated.get_tag(), ValueTag::U64);
    EXPECT_EQ(val_u64_truncated.as<uint64_t>(), 123);

    // U128 - truncates to 128 bits
    auto val_u128 = TaggedValue::from_tag_truncating(ValueTag::U128, uint256_t::from_uint128(uint128_t(1) << 100));
    EXPECT_EQ(val_u128.get_tag(), ValueTag::U128);
    EXPECT_EQ(val_u128.as<uint128_t>(), uint128_t(1) << 100);

    FF large_u128 = (uint256_t(1) << 129) + 456; // 2^129 + 456 = 456 mod 2^128
    auto val_u128_truncated = TaggedValue::from_tag_truncating(ValueTag::U128, large_u128);
    EXPECT_EQ(val_u128_truncated.get_tag(), ValueTag::U128);
    EXPECT_EQ(val_u128_truncated.as<uint128_t>(), 456);

    // FF - no truncation
    FF large_ff = FF::random_element();
    auto val_ff = TaggedValue::from_tag_truncating(ValueTag::FF, large_ff);
    EXPECT_EQ(val_ff.get_tag(), ValueTag::FF);
    EXPECT_EQ(val_ff.as<FF>(), large_ff);
}

// Test from_tag method with out of bounds values
TEST(TaggedValueTest, FromTagOutOfBounds)
{
    // U8 - max value is 255
    EXPECT_NO_THROW(TaggedValue::from_tag(ValueTag::U8, FF(255)));
    EXPECT_THROW(TaggedValue::from_tag(ValueTag::U8, FF(256)), std::runtime_error);

    // U16 - max value is 65535
    EXPECT_NO_THROW(TaggedValue::from_tag(ValueTag::U16, FF(65535)));
    EXPECT_THROW(TaggedValue::from_tag(ValueTag::U16, FF(65536)), std::runtime_error);

    // U32 - max value is 2^32-1
    EXPECT_NO_THROW(TaggedValue::from_tag(ValueTag::U32, FF((1ULL << 32) - 1)));
    EXPECT_THROW(TaggedValue::from_tag(ValueTag::U32, FF(1ULL << 32)), std::runtime_error);

    // U64 - max value is 2^64-1
    FF max_u64 = FF(uint256_t((1ULL << 63)) * 2 - 1);
    EXPECT_NO_THROW(TaggedValue::from_tag(ValueTag::U64, max_u64));
    EXPECT_THROW(TaggedValue::from_tag(ValueTag::U64, max_u64 + FF(1)), std::runtime_error);

    // U128 - max value is 2^128-1
    FF max_u128 = FF(uint256_t(1) << 128) - FF(1);
    EXPECT_NO_THROW(TaggedValue::from_tag(ValueTag::U128, max_u128));
    EXPECT_THROW(TaggedValue::from_tag(ValueTag::U128, max_u128 + FF(1)), std::runtime_error);

    // Invalid tag
    EXPECT_THROW(TaggedValue::from_tag(static_cast<ValueTag>(100), FF(1)), std::runtime_error);
}

// Test as_ff method
TEST(TaggedValueTest, AsFF)
{
    // Test conversion to FF from each type
    auto val_u1 = TaggedValue::from<uint1_t>(1);
    EXPECT_EQ(val_u1.as_ff(), FF(1));

    auto val_u8 = TaggedValue::from<uint8_t>(42);
    EXPECT_EQ(val_u8.as_ff(), FF(42));

    auto val_u16 = TaggedValue::from<uint16_t>(1000);
    EXPECT_EQ(val_u16.as_ff(), FF(1000));

    auto val_u32 = TaggedValue::from<uint32_t>(100000);
    EXPECT_EQ(val_u32.as_ff(), FF(100000));

    auto val_u64 = TaggedValue::from<uint64_t>(1ULL << 40);
    EXPECT_EQ(val_u64.as_ff(), FF(1ULL << 40));

    // uint128 to FF
    auto val_u128 = TaggedValue::from<uint128_t>(123);
    EXPECT_EQ(val_u128.as_ff(), FF(123));

    // FF to FF should be identity
    FF field_val(123);
    auto val_ff = TaggedValue::from<FF>(field_val);
    EXPECT_EQ(val_ff.as_ff(), field_val);
}

// Test arithmetic operations for each type
TEST(TaggedValueTest, ArithmeticOperations)
{
    // Test uint1_t operations
    auto u1_val0 = TaggedValue::from<uint1_t>(0);
    auto u1_val1 = TaggedValue::from<uint1_t>(1);

    auto u1_add = u1_val1 + u1_val0;
    EXPECT_EQ(u1_add.get_tag(), ValueTag::U1);
    EXPECT_EQ(u1_add.as<uint1_t>().value(), 1);

    auto u1_sub = u1_val1 - u1_val0;
    EXPECT_EQ(u1_sub.get_tag(), ValueTag::U1);
    EXPECT_EQ(u1_sub.as<uint1_t>().value(), 1);

    auto u1_mul = u1_val1 * u1_val0;
    EXPECT_EQ(u1_mul.get_tag(), ValueTag::U1);
    EXPECT_EQ(u1_mul.as<uint1_t>().value(), 0);

    // Division by zero would throw, so we'll test with non-zero
    auto u1_div = u1_val1 / u1_val1;
    EXPECT_EQ(u1_div.get_tag(), ValueTag::U1);
    EXPECT_EQ(u1_div.as<uint1_t>().value(), 1);

    // Test uint8_t operations
    auto u8_val1 = TaggedValue::from<uint8_t>(40);
    auto u8_val2 = TaggedValue::from<uint8_t>(2);

    auto u8_add = u8_val1 + u8_val2;
    EXPECT_EQ(u8_add.get_tag(), ValueTag::U8);
    EXPECT_EQ(u8_add.as<uint8_t>(), 42);

    auto u8_sub = u8_val1 - u8_val2;
    EXPECT_EQ(u8_sub.get_tag(), ValueTag::U8);
    EXPECT_EQ(u8_sub.as<uint8_t>(), 38);

    auto u8_mul = u8_val1 * u8_val2;
    EXPECT_EQ(u8_mul.get_tag(), ValueTag::U8);
    EXPECT_EQ(u8_mul.as<uint8_t>(), 80);

    auto u8_div = u8_val1 / u8_val2;
    EXPECT_EQ(u8_div.get_tag(), ValueTag::U8);
    EXPECT_EQ(u8_div.as<uint8_t>(), 20);

    // Test uint16_t operations
    auto u16_val1 = TaggedValue::from<uint16_t>(1000);
    auto u16_val2 = TaggedValue::from<uint16_t>(10);

    auto u16_add = u16_val1 + u16_val2;
    EXPECT_EQ(u16_add.get_tag(), ValueTag::U16);
    EXPECT_EQ(u16_add.as<uint16_t>(), 1010);

    auto u16_sub = u16_val1 - u16_val2;
    EXPECT_EQ(u16_sub.get_tag(), ValueTag::U16);
    EXPECT_EQ(u16_sub.as<uint16_t>(), 990);

    auto u16_mul = u16_val1 * u16_val2;
    EXPECT_EQ(u16_mul.get_tag(), ValueTag::U16);
    EXPECT_EQ(u16_mul.as<uint16_t>(), 10000);

    auto u16_div = u16_val1 / u16_val2;
    EXPECT_EQ(u16_div.get_tag(), ValueTag::U16);
    EXPECT_EQ(u16_div.as<uint16_t>(), 100);

    // Test uint32_t operations
    auto u32_val1 = TaggedValue::from<uint32_t>(100000);
    auto u32_val2 = TaggedValue::from<uint32_t>(25);

    auto u32_add = u32_val1 + u32_val2;
    EXPECT_EQ(u32_add.get_tag(), ValueTag::U32);
    EXPECT_EQ(u32_add.as<uint32_t>(), 100025);

    auto u32_sub = u32_val1 - u32_val2;
    EXPECT_EQ(u32_sub.get_tag(), ValueTag::U32);
    EXPECT_EQ(u32_sub.as<uint32_t>(), 99975);

    auto u32_mul = u32_val1 * u32_val2;
    EXPECT_EQ(u32_mul.get_tag(), ValueTag::U32);
    EXPECT_EQ(u32_mul.as<uint32_t>(), 2500000);

    auto u32_div = u32_val1 / u32_val2;
    EXPECT_EQ(u32_div.get_tag(), ValueTag::U32);
    EXPECT_EQ(u32_div.as<uint32_t>(), 4000);

    // Test uint64_t operations
    auto u64_val1 = TaggedValue::from<uint64_t>(1ULL << 32);
    auto u64_val2 = TaggedValue::from<uint64_t>(5);

    auto u64_add = u64_val1 + u64_val2;
    EXPECT_EQ(u64_add.get_tag(), ValueTag::U64);
    EXPECT_EQ(u64_add.as<uint64_t>(), (1ULL << 32) + 5);

    auto u64_sub = u64_val1 - u64_val2;
    EXPECT_EQ(u64_sub.get_tag(), ValueTag::U64);
    EXPECT_EQ(u64_sub.as<uint64_t>(), (1ULL << 32) - 5);

    auto u64_mul = u64_val1 * u64_val2;
    EXPECT_EQ(u64_mul.get_tag(), ValueTag::U64);
    EXPECT_EQ(u64_mul.as<uint64_t>(), (1ULL << 32) * 5);

    auto u64_div = u64_val1 / u64_val2;
    EXPECT_EQ(u64_div.get_tag(), ValueTag::U64);
    EXPECT_EQ(u64_div.as<uint64_t>(), (1ULL << 32) / 5);

    // Test uint128_t operations
    auto u128_val1 = TaggedValue::from<uint128_t>(1000000000000ULL);
    auto u128_val2 = TaggedValue::from<uint128_t>(7);

    auto u128_add = u128_val1 + u128_val2;
    EXPECT_EQ(u128_add.get_tag(), ValueTag::U128);
    EXPECT_EQ(u128_add.as<uint128_t>(), uint128_t(1000000000000ULL) + uint128_t(7));

    auto u128_sub = u128_val1 - u128_val2;
    EXPECT_EQ(u128_sub.get_tag(), ValueTag::U128);
    EXPECT_EQ(u128_sub.as<uint128_t>(), uint128_t(1000000000000ULL) - uint128_t(7));

    auto u128_mul = u128_val1 * u128_val2;
    EXPECT_EQ(u128_mul.get_tag(), ValueTag::U128);
    EXPECT_EQ(u128_mul.as<uint128_t>(), uint128_t(1000000000000ULL) * uint128_t(7));

    auto u128_div = u128_val1 / u128_val2;
    EXPECT_EQ(u128_div.get_tag(), ValueTag::U128);
    EXPECT_EQ(u128_div.as<uint128_t>(), uint128_t(1000000000000ULL) / uint128_t(7));

    // Test arithmetic operations with FF
    auto ff_val1 = TaggedValue::from<FF>(100);
    auto ff_val2 = TaggedValue::from<FF>(5);

    auto ff_add = ff_val1 + ff_val2;
    EXPECT_EQ(ff_add.get_tag(), ValueTag::FF);
    EXPECT_EQ(ff_add.as<FF>(), FF(105));

    auto ff_sub = ff_val1 - ff_val2;
    EXPECT_EQ(ff_sub.get_tag(), ValueTag::FF);
    EXPECT_EQ(ff_sub.as<FF>(), FF(95));

    auto ff_mul = ff_val1 * ff_val2;
    EXPECT_EQ(ff_mul.get_tag(), ValueTag::FF);
    EXPECT_EQ(ff_mul.as<FF>(), FF(500));

    auto ff_div = ff_val1 / ff_val2;
    EXPECT_EQ(ff_div.get_tag(), ValueTag::FF);
    EXPECT_EQ(ff_div.as<FF>(), FF(20));
}

// Test bitwise operations
TEST(TaggedValueTest, BitwiseOperations)
{
    // Test bitwise AND
    auto u8_val1 = TaggedValue::from<uint8_t>(0b1010);
    auto u8_val2 = TaggedValue::from<uint8_t>(0b1100);
    auto u8_and = u8_val1 & u8_val2;
    EXPECT_EQ(u8_and.get_tag(), ValueTag::U8);
    EXPECT_EQ(u8_and.as<uint8_t>(), 0b1000);

    // Test bitwise OR
    auto u16_val1 = TaggedValue::from<uint16_t>(0b1010);
    auto u16_val2 = TaggedValue::from<uint16_t>(0b1100);
    auto u16_or = u16_val1 | u16_val2;
    EXPECT_EQ(u16_or.get_tag(), ValueTag::U16);
    EXPECT_EQ(u16_or.as<uint16_t>(), 0b1110);

    // Test bitwise XOR
    auto u32_val1 = TaggedValue::from<uint32_t>(0b1010);
    auto u32_val2 = TaggedValue::from<uint32_t>(0b1100);
    auto u32_xor = u32_val1 ^ u32_val2;
    EXPECT_EQ(u32_xor.get_tag(), ValueTag::U32);
    EXPECT_EQ(u32_xor.as<uint32_t>(), 0b0110);

    // Test bitwise NOT
    auto u64_val = TaggedValue::from<uint64_t>(0xFFFFFFFFFFFFFFF0ULL);
    auto u64_not = ~u64_val;
    EXPECT_EQ(u64_not.get_tag(), ValueTag::U64);
    EXPECT_EQ(u64_not.as<uint64_t>(), 0x000000000000000FULL);

    // Test shift operations
    auto u8_shift = TaggedValue::from<uint8_t>(0b00000001);
    auto u8_amount = TaggedValue::from<uint8_t>(2);

    auto u8_shl = u8_shift << u8_amount;
    EXPECT_EQ(u8_shl.get_tag(), ValueTag::U8);
    EXPECT_EQ(u8_shl.as<uint8_t>(), 0b00000100);

    auto u8_shift_high = TaggedValue::from<uint8_t>(0b10000000);
    auto u8_shr = u8_shift_high >> u8_amount;
    EXPECT_EQ(u8_shr.get_tag(), ValueTag::U8);
    EXPECT_EQ(u8_shr.as<uint8_t>(), 0b00100000);
}

// Test unary operations for all types
TEST(TaggedValueTest, UnaryOperations)
{
    // Test unary bit negation.
    auto u1_val = TaggedValue::from<uint1_t>(1);
    auto u1_not = ~u1_val;
    EXPECT_EQ(u1_not.get_tag(), ValueTag::U1);
    EXPECT_EQ(u1_not.as<uint1_t>().value(), 0);

    auto u8_val = TaggedValue::from<uint8_t>(0xAA); // 10101010
    auto u8_not = ~u8_val;
    EXPECT_EQ(u8_not.get_tag(), ValueTag::U8);
    EXPECT_EQ(u8_not.as<uint8_t>(), 0x55); // 01010101

    auto u16_val = TaggedValue::from<uint16_t>(0xAAAA); // 1010101010101010
    auto u16_not = ~u16_val;
    EXPECT_EQ(u16_not.get_tag(), ValueTag::U16);
    EXPECT_EQ(u16_not.as<uint16_t>(), 0x5555); // 0101010101010101

    auto u32_val = TaggedValue::from<uint32_t>(0xAAAAAAAA); // 10101010...
    auto u32_not = ~u32_val;
    EXPECT_EQ(u32_not.get_tag(), ValueTag::U32);
    EXPECT_EQ(u32_not.as<uint32_t>(), 0x55555555); // 01010101...

    auto u64_val = TaggedValue::from<uint64_t>(0xAAAAAAAAAAAAAAAAULL);
    auto u64_not = ~u64_val;
    EXPECT_EQ(u64_not.get_tag(), ValueTag::U64);
    EXPECT_EQ(u64_not.as<uint64_t>(), 0x5555555555555555ULL);

    uint128_t u128_input = (uint128_t(0xAAAAAAAAAAAAAAAAULL) << 64) | uint128_t(0xAAAAAAAAAAAAAAAAULL);
    auto u128_val = TaggedValue::from<uint128_t>(u128_input);
    auto u128_not = ~u128_val;
    EXPECT_EQ(u128_not.get_tag(), ValueTag::U128);
    uint128_t expected_u128 = (uint128_t(0x5555555555555555ULL) << 64) | uint128_t(0x5555555555555555ULL);
    EXPECT_EQ(u128_not.as<uint128_t>(), expected_u128);

    // Test that unary bitwise operations on FF throw exceptions
    auto ff_val = TaggedValue::from<FF>(123);
    EXPECT_THROW(~ff_val, std::runtime_error);
}

// Test edge cases with uint1_t
TEST(TaggedValueTest, Uint1EdgeCases)
{
    // Test uint1_t operations
    auto u1_val0 = TaggedValue::from<uint1_t>(0);
    auto u1_val1 = TaggedValue::from<uint1_t>(1);

    // Bitwise operations
    auto u1_and = u1_val1 & u1_val1;
    EXPECT_EQ(u1_and.get_tag(), ValueTag::U1);
    EXPECT_EQ(u1_and.as<uint1_t>().value(), 1);

    auto u1_or = u1_val0 | u1_val1;
    EXPECT_EQ(u1_or.get_tag(), ValueTag::U1);
    EXPECT_EQ(u1_or.as<uint1_t>().value(), 1);

    auto u1_xor = u1_val1 ^ u1_val1;
    EXPECT_EQ(u1_xor.get_tag(), ValueTag::U1);
    EXPECT_EQ(u1_xor.as<uint1_t>().value(), 0);

    auto u1_not = ~u1_val1;
    EXPECT_EQ(u1_not.get_tag(), ValueTag::U1);
    EXPECT_EQ(u1_not.as<uint1_t>().value(), 0);
}

// Test error cases
TEST(TaggedValueTest, ErrorCases)
{
    // Test type mismatch
    auto u8_val = TaggedValue::from<uint8_t>(42);
    EXPECT_THROW(u8_val.as<uint16_t>(), std::runtime_error);

    // Test bitwise operations on FF (should throw)
    auto ff_val1 = TaggedValue::from<FF>(10);
    auto ff_val2 = TaggedValue::from<FF>(5);

    EXPECT_THROW(ff_val1 & ff_val2, std::runtime_error);
    EXPECT_THROW(ff_val1 | ff_val2, std::runtime_error);
    EXPECT_THROW(ff_val1 ^ ff_val2, std::runtime_error);
    EXPECT_THROW(~ff_val1, std::runtime_error);

    // Test mixed type operations
    auto u8_val1 = TaggedValue::from<uint8_t>(10);
    auto u16_val = TaggedValue::from<uint16_t>(5);

    // Binary operations with different types should throw
    EXPECT_THROW(u8_val1 + u16_val, std::runtime_error);
    EXPECT_THROW(u8_val1 - u16_val, std::runtime_error);
    EXPECT_THROW(u8_val1 * u16_val, std::runtime_error);
    EXPECT_THROW(u8_val1 / u16_val, std::runtime_error);
    EXPECT_THROW(u8_val1 & u16_val, std::runtime_error);
    EXPECT_THROW(u8_val1 | u16_val, std::runtime_error);
    EXPECT_THROW(u8_val1 ^ u16_val, std::runtime_error);
}

// Test shift operations with different right-side types
TEST(TaggedValueTest, ShiftOperationsWithDifferentTypes)
{
    auto u32_val = TaggedValue::from<uint32_t>(1);

    // Shift with uint8_t
    auto u8_amount = TaggedValue::from<uint8_t>(3);
    auto result_shl_u8 = u32_val << u8_amount;
    EXPECT_EQ(result_shl_u8.get_tag(), ValueTag::U32);
    EXPECT_EQ(result_shl_u8.as<uint32_t>(), 1 << 3);

    // Shift with uint16_t
    auto u16_amount = TaggedValue::from<uint16_t>(4);
    auto result_shl_u16 = u32_val << u16_amount;
    EXPECT_EQ(result_shl_u16.get_tag(), ValueTag::U32);
    EXPECT_EQ(result_shl_u16.as<uint32_t>(), 1 << 4);

    // Shift with uint1_t
    auto u1_amount = TaggedValue::from<uint1_t>(1);
    auto result_shl_u1 = u32_val << u1_amount;
    EXPECT_EQ(result_shl_u1.get_tag(), ValueTag::U32);
    EXPECT_EQ(result_shl_u1.as<uint32_t>(), 2);
}

// Test boundary cases for all types
TEST(TaggedValueTest, BoundaryCases)
{
    // Test uint1_t overflow
    auto u1_max = TaggedValue::from<uint1_t>(true);
    auto u1_one = TaggedValue::from<uint1_t>(true);
    auto u1_overflow = u1_max + u1_one;
    EXPECT_EQ(u1_overflow.get_tag(), ValueTag::U1);
    EXPECT_EQ(u1_overflow.as<uint1_t>().value(), 0); // 1+1=0 with overflow

    // Test uint8_t overflow
    auto u8_max = TaggedValue::from<uint8_t>(255);
    auto u8_one = TaggedValue::from<uint8_t>(1);
    auto u8_overflow = u8_max + u8_one;
    EXPECT_EQ(u8_overflow.get_tag(), ValueTag::U8);
    EXPECT_EQ(u8_overflow.as<uint8_t>(), 0); // Overflow wraps around

    // Test uint16_t overflow
    auto u16_max = TaggedValue::from<uint16_t>(65535);
    auto u16_one = TaggedValue::from<uint16_t>(1);
    auto u16_overflow = u16_max + u16_one;
    EXPECT_EQ(u16_overflow.get_tag(), ValueTag::U16);
    EXPECT_EQ(u16_overflow.as<uint16_t>(), 0); // Overflow wraps around

    // Test uint32_t overflow
    auto u32_max = TaggedValue::from<uint32_t>(4294967295U);
    auto u32_one = TaggedValue::from<uint32_t>(1);
    auto u32_overflow = u32_max + u32_one;
    EXPECT_EQ(u32_overflow.get_tag(), ValueTag::U32);
    EXPECT_EQ(u32_overflow.as<uint32_t>(), 0); // Overflow wraps around

    // Test uint64_t overflow
    auto u64_max = TaggedValue::from<uint64_t>(std::numeric_limits<uint64_t>::max());
    auto u64_one = TaggedValue::from<uint64_t>(1);
    auto u64_overflow = u64_max + u64_one;
    EXPECT_EQ(u64_overflow.get_tag(), ValueTag::U64);
    EXPECT_EQ(u64_overflow.as<uint64_t>(), 0); // Overflow wraps around

    // Test uint128_t overflow
    auto u128_max = TaggedValue::from<uint128_t>(~uint128_t(0));
    auto u128_one = TaggedValue::from<uint128_t>(1);
    auto u128_overflow = u128_max + u128_one;
    EXPECT_EQ(u128_overflow.get_tag(), ValueTag::U128);
    EXPECT_EQ(u128_overflow.as<uint128_t>(), 0); // Overflow wraps around

    // Test underflow for all types
    auto u1_zero = TaggedValue::from<uint1_t>(0);
    auto u1_underflow = u1_zero - u1_one;
    EXPECT_EQ(u1_underflow.get_tag(), ValueTag::U1);
    EXPECT_EQ(u1_underflow.as<uint1_t>().value(), 1); // 0-1=1 with underflow

    auto u8_zero = TaggedValue::from<uint8_t>(0);
    auto u8_underflow = u8_zero - u8_one;
    EXPECT_EQ(u8_underflow.get_tag(), ValueTag::U8);
    EXPECT_EQ(u8_underflow.as<uint8_t>(), 255); // Underflow wraps around

    auto u16_zero = TaggedValue::from<uint16_t>(0);
    auto u16_underflow = u16_zero - u16_one;
    EXPECT_EQ(u16_underflow.get_tag(), ValueTag::U16);
    EXPECT_EQ(u16_underflow.as<uint16_t>(), 65535); // Underflow wraps around

    auto u32_zero = TaggedValue::from<uint32_t>(0);
    auto u32_underflow = u32_zero - u32_one;
    EXPECT_EQ(u32_underflow.get_tag(), ValueTag::U32);
    EXPECT_EQ(u32_underflow.as<uint32_t>(), 4294967295U); // Underflow wraps around

    auto u64_zero = TaggedValue::from<uint64_t>(0);
    auto u64_underflow = u64_zero - u64_one;
    EXPECT_EQ(u64_underflow.get_tag(), ValueTag::U64);
    EXPECT_EQ(u64_underflow.as<uint64_t>(), std::numeric_limits<uint64_t>::max()); // Underflow wraps around

    auto u128_zero = TaggedValue::from<uint128_t>(0);
    auto u128_underflow = u128_zero - u128_one;
    EXPECT_EQ(u128_underflow.get_tag(), ValueTag::U128);
    EXPECT_EQ(u128_underflow.as<uint128_t>(), ~uint128_t(0)); // Underflow wraps around

    // Test multiplication overflow
    auto u8_large = TaggedValue::from<uint8_t>(128);
    auto u8_mul_overflow = u8_large * u8_large;
    EXPECT_EQ(u8_mul_overflow.get_tag(), ValueTag::U8);
    EXPECT_EQ(u8_mul_overflow.as<uint8_t>(), 0); // 128*128=16384, which is 0 mod 256

    auto u16_large = TaggedValue::from<uint16_t>(256);
    auto u16_mul_overflow = u16_large * u16_large;
    EXPECT_EQ(u16_mul_overflow.get_tag(), ValueTag::U16);
    EXPECT_EQ(u16_mul_overflow.as<uint16_t>(), 0); // 256*256=65536, which is 0 mod 65536

    // Test shift overflow
    auto u8_shift = TaggedValue::from<uint8_t>(1);
    auto u8_shift_amount = TaggedValue::from<uint8_t>(8);
    auto u8_shift_overflow = u8_shift << u8_shift_amount;
    EXPECT_EQ(u8_shift_overflow.get_tag(), ValueTag::U8);
    EXPECT_EQ(u8_shift_overflow.as<uint8_t>(), 0); // 1<<8=256, which is 0 mod 256

    auto ff_large = TaggedValue::from<FF>(FF::modulus - FF(1));
    auto ff_one = TaggedValue::from<FF>(1);
    auto ff_wrap = ff_large + ff_one;
    EXPECT_EQ(ff_wrap.get_tag(), ValueTag::FF);
    EXPECT_EQ(ff_wrap.as<FF>(), FF(0)); // Modular arithmetic wraps naturally
}

} // namespace
} // namespace bb::avm2
