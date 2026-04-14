#include "get_msb.hpp"
#include <gtest/gtest.h>

using namespace bb;

TEST(bitop, GetMsbUint640Value)
{
    uint64_t a = 0b00000000000000000000000000000000;
    EXPECT_EQ(numeric::get_msb(a), 0U);
}

TEST(bitop, GetMsbUint320)
{
    uint32_t a = 0b00000000000000000000000000000001;
    EXPECT_EQ(numeric::get_msb(a), 0U);
}

TEST(bitop, GetMsbUint3231)
{
    uint32_t a = 0b10000000000000000000000000000001;
    EXPECT_EQ(numeric::get_msb(a), 31U);
}

TEST(bitop, GetMsbUint6463)
{
    uint64_t a = 0b1000000000000000000000000000000100000000000000000000000000000000;
    EXPECT_EQ(numeric::get_msb(a), 63U);
}

TEST(bitop, GetMsbSizeT7)
{
    size_t a = 0x80;
    auto r = numeric::get_msb(a);
    EXPECT_EQ(r, 7U);
}

// Verify De Bruijn lookup tables by testing every bit position with multiple input patterns
TEST(bitop, GetMsbUint32AllPositions)
{
    for (uint32_t i = 0; i < 32; i++) {
        // Power of 2: exactly one bit set
        EXPECT_EQ(numeric::get_msb(uint32_t(1U << i)), i);
        // All bits set up to position i (exercises the post-smearing pattern)
        uint32_t all_ones = (i == 31) ? 0xFFFFFFFF : ((1U << (i + 1)) - 1);
        EXPECT_EQ(numeric::get_msb(all_ones), i);
        // MSB set plus random low bit
        if (i > 0) {
            EXPECT_EQ(numeric::get_msb(uint32_t((1U << i) | 1U)), i);
        }
    }
}

TEST(bitop, GetMsbUint64AllPositions)
{
    for (uint64_t i = 0; i < 64; i++) {
        // Power of 2
        EXPECT_EQ(numeric::get_msb(uint64_t(1ULL << i)), i);
        // All bits set up to position i
        uint64_t all_ones = (i == 63) ? 0xFFFFFFFFFFFFFFFFULL : ((1ULL << (i + 1)) - 1);
        EXPECT_EQ(numeric::get_msb(all_ones), i);
        // MSB set plus low bit
        if (i > 0) {
            EXPECT_EQ(numeric::get_msb(uint64_t((1ULL << i) | 1ULL)), i);
        }
    }
}

// get_lsb tests
TEST(bitop, GetLsbZero)
{
    EXPECT_EQ(numeric::get_lsb(uint32_t(0)), 0U);
    EXPECT_EQ(numeric::get_lsb(uint64_t(0)), 0U);
}

TEST(bitop, GetLsbOne)
{
    EXPECT_EQ(numeric::get_lsb(uint32_t(1)), 0U);
    EXPECT_EQ(numeric::get_lsb(uint64_t(1)), 0U);
}

TEST(bitop, GetLsbPowersOfTwo)
{
    for (uint32_t i = 0; i < 32; i++) {
        EXPECT_EQ(numeric::get_lsb(uint32_t(1U << i)), i);
    }
    for (uint64_t i = 0; i < 64; i++) {
        EXPECT_EQ(numeric::get_lsb(uint64_t(1ULL << i)), i);
    }
}

TEST(bitop, GetLsbComposite)
{
    // LSB of 0b1100 is bit 2
    EXPECT_EQ(numeric::get_lsb(uint32_t(0b1100)), 2U);
    // LSB of 0xFF00 is bit 8
    EXPECT_EQ(numeric::get_lsb(uint64_t(0xFF00)), 8U);
}

// round_up_power_2 tests
TEST(bitop, RoundUpPower2Zero)
{
    EXPECT_EQ(numeric::round_up_power_2(uint32_t(0)), 0U);
    EXPECT_EQ(numeric::round_up_power_2(uint64_t(0)), 0ULL);
}

TEST(bitop, RoundUpPower2PowersOfTwo)
{
    // Powers of two should be returned unchanged
    for (uint32_t i = 0; i < 31; i++) {
        uint32_t val = 1U << i;
        EXPECT_EQ(numeric::round_up_power_2(val), val);
    }
}

TEST(bitop, RoundUpPower2NonPowers)
{
    EXPECT_EQ(numeric::round_up_power_2(uint32_t(3)), 4U);
    EXPECT_EQ(numeric::round_up_power_2(uint32_t(5)), 8U);
    EXPECT_EQ(numeric::round_up_power_2(uint32_t(7)), 8U);
    EXPECT_EQ(numeric::round_up_power_2(uint32_t(9)), 16U);
    EXPECT_EQ(numeric::round_up_power_2(uint32_t(100)), 128U);
    EXPECT_EQ(numeric::round_up_power_2(uint64_t(1000)), 1024ULL);
}

TEST(bitop, RoundUpPower2LargestValid)
{
    // Largest non-power-of-2 that doesn't overflow: 2^30 + 1 -> 2^31
    EXPECT_EQ(numeric::round_up_power_2(uint32_t((1U << 30) + 1)), 1U << 31);
}
