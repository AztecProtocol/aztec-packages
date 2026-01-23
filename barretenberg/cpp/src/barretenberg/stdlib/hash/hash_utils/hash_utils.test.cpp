#include "barretenberg/stdlib/hash/hash_utils.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include <gtest/gtest.h>

using namespace bb;
using namespace bb::stdlib;

using Builder = UltraCircuitBuilder;
using field_ct = field_t<Builder>;
using witness_ct = witness_t<Builder>;

namespace {
constexpr uint64_t MAX_U32 = (1ULL << 32) - 1;
} // namespace

// Tests constant path: both operands constant, with and without overflow
TEST(HashUtilsTests, Constants)
{
    Builder builder;

    // No overflow
    field_ct a1 = field_ct(&builder, fr(100));
    field_ct b1 = field_ct(&builder, fr(200));
    field_ct r1 = hash_utils::add_normalize_unsafe(a1, b1, /*overflow_bits=*/1);
    EXPECT_EQ(r1.get_value(), fr(300));
    EXPECT_TRUE(r1.is_constant());

    // With overflow: (2^32 - 1) + 101 = 2^32 + 100, wraps to 100
    field_ct a2 = field_ct(&builder, fr(MAX_U32));
    field_ct b2 = field_ct(&builder, fr(101));
    field_ct r2 = hash_utils::add_normalize_unsafe(a2, b2, /*overflow_bits=*/1);
    EXPECT_EQ(r2.get_value(), fr(100));
    EXPECT_TRUE(r2.is_constant());

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Tests witness path with various value combinations and overflow scenarios
TEST(HashUtilsTests, Witnesses)
{
    Builder builder;

    // No overflow
    field_ct a1 = witness_ct(&builder, fr(1000));
    field_ct b1 = witness_ct(&builder, fr(2000));
    field_ct r1 = hash_utils::add_normalize_unsafe(a1, b1, /*overflow_bits=*/1);
    EXPECT_EQ(r1.get_value(), fr(3000));

    // Overflow by 1: (2^32 - 1) + 1 = 2^32, wraps to 0
    field_ct a2 = witness_ct(&builder, fr(MAX_U32));
    field_ct b2 = witness_ct(&builder, fr(1));
    field_ct r2 = hash_utils::add_normalize_unsafe(a2, b2, /*overflow_bits=*/1);
    EXPECT_EQ(r2.get_value(), fr(0));

    // Max overflow for two 32-bit values: (2^32-1) + (2^32-1) = 2^33 - 2, wraps to 2^32 - 2
    field_ct a3 = witness_ct(&builder, fr(MAX_U32));
    field_ct b3 = witness_ct(&builder, fr(MAX_U32));
    field_ct r3 = hash_utils::add_normalize_unsafe(a3, b3, /*overflow_bits=*/1);
    EXPECT_EQ(r3.get_value(), fr(MAX_U32 - 1));

    // Zero handling
    field_ct a4 = witness_ct(&builder, fr(0));
    field_ct b4 = witness_ct(&builder, fr(12345));
    field_ct r4 = hash_utils::add_normalize_unsafe(a4, b4, /*overflow_bits=*/1);
    EXPECT_EQ(r4.get_value(), fr(12345));

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Tests mixed constant/witness - ensures context is properly obtained from either operand
TEST(HashUtilsTests, MixedConstantWitness)
{
    Builder builder;

    // Witness first, constant second
    field_ct a1 = witness_ct(&builder, fr(500));
    field_ct b1 = field_ct(&builder, fr(700));
    field_ct r1 = hash_utils::add_normalize_unsafe(a1, b1, /*overflow_bits=*/1);
    EXPECT_EQ(r1.get_value(), fr(1200));

    // Constant first (no context), witness second
    field_ct a2 = field_ct(fr(100));
    field_ct b2 = witness_ct(&builder, fr(200));
    field_ct r2 = hash_utils::add_normalize_unsafe(a2, b2, /*overflow_bits=*/1);
    EXPECT_EQ(r2.get_value(), fr(300));

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Tests multi-bit overflow as used in SHA-256/Blake2s where sums can accumulate
TEST(HashUtilsTests, MultiBitOverflow)
{
    Builder builder;

    // Simulate accumulated sum scenario needing >1 overflow bit
    // Two 33-bit values: sum needs 2 overflow bits
    uint64_t large_val = (1ULL << 33) - 1;
    field_ct a = witness_ct(&builder, fr(large_val));
    field_ct b = witness_ct(&builder, fr(large_val));

    field_ct result = hash_utils::add_normalize_unsafe(a, b, /*overflow_bits=*/3);

    uint64_t expected = static_cast<uint32_t>((2 * large_val) & MAX_U32);
    EXPECT_EQ(result.get_value(), fr(expected));
    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Tests chained operations as used in hash compression functions
TEST(HashUtilsTests, ChainedOperations)
{
    Builder builder;

    field_ct a = witness_ct(&builder, fr(MAX_U32));
    field_ct b = witness_ct(&builder, fr(MAX_U32));
    field_ct c = witness_ct(&builder, fr(MAX_U32));
    field_ct d = witness_ct(&builder, fr(MAX_U32));

    field_ct sum1 = hash_utils::add_normalize_unsafe(a, b, /*overflow_bits=*/1);
    field_ct sum2 = hash_utils::add_normalize_unsafe(sum1, c, /*overflow_bits=*/1);
    field_ct sum3 = hash_utils::add_normalize_unsafe(sum2, d, /*overflow_bits=*/1);

    // 4 * (2^32 - 1) mod 2^32 = -4 mod 2^32 = 2^32 - 4
    uint64_t expected = (4ULL * MAX_U32) & MAX_U32;
    EXPECT_EQ(sum3.get_value(), fr(expected));
    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Tests that circuit fails when overflow_bits is insufficient for actual overflow
TEST(HashUtilsTests, InsufficientOverflowBitsFails)
{
    Builder builder;

    // Two 33-bit values sum to ~2^34, requiring overflow of ~4 (needs 3 bits)
    // But we only provide 1 overflow bit, so range constraint should fail
    uint64_t large_val = (1ULL << 33) - 1;
    field_ct a = witness_ct(&builder, fr(large_val));
    field_ct b = witness_ct(&builder, fr(large_val));

    [[maybe_unused]] field_ct result = hash_utils::add_normalize_unsafe(a, b, /*overflow_bits=*/1);

    EXPECT_FALSE(CircuitChecker::check(builder));
}
