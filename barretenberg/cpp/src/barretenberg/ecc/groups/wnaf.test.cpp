#include "wnaf.hpp"
#include "../curves/bn254/fr.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include <gtest/gtest.h>

using namespace bb;

namespace {
auto& engine = numeric::get_debug_randomness();
}

// NOLINTBEGIN(cppcoreguidelines-avoid-c-arrays)
namespace {

void recover_fixed_wnaf(const uint64_t* wnaf, bool skew, uint64_t& hi, uint64_t& lo, size_t wnaf_bits)
{
    const size_t wnaf_entries = (127 + wnaf_bits - 1) / wnaf_bits;
    const uint64_t max_table_index = (1UL << (wnaf_bits - 1)) - 1;

    for (size_t i = 0; i < wnaf_entries; ++i) {
        uint64_t entry = wnaf[i];
        uint64_t table_index = entry & 0x7fffffffUL;
        bool sign = ((entry >> 31) & 1) != 0U;
        uint64_t point_index_bits = entry >> 32;

        EXPECT_LE(table_index, max_table_index)
            << "entry " << i << ": table_index " << table_index << " exceeds max " << max_table_index;

        // The most significant digit is always positive by construction (no sign bit is OR'd in).
        if (i == 0) {
            EXPECT_FALSE(sign) << "entry 0 (most significant digit) must be positive";
        }

        // All current callers use point_index=0, so bits 32-63 should be clear.
        EXPECT_EQ(point_index_bits, 0UL) << "entry " << i << ": unexpected non-zero point_index bits";
    }

    // Recover the scalar: sum signed odd digits at their positional weights, then subtract skew.
    uint128_t scalar = 0;
    for (size_t i = 0; i < wnaf_entries; ++i) {
        uint64_t entry_formatted = wnaf[i];
        bool negative = ((entry_formatted >> 31) & 1) != 0U;
        uint64_t digit = ((entry_formatted & 0x7fffffffUL) << 1) + 1;
        auto shift = static_cast<uint128_t>(wnaf_bits * (wnaf_entries - 1 - i));
        if (negative) {
            scalar -= static_cast<uint128_t>(digit) << shift;
        } else {
            scalar += static_cast<uint128_t>(digit) << shift;
        }
    }
    scalar -= static_cast<uint128_t>(skew);
    hi = static_cast<uint64_t>(scalar >> static_cast<uint128_t>(64));
    lo = static_cast<uint64_t>(scalar & static_cast<uint128_t>(0xffff'ffff'ffff'ffff));
}
} // namespace

TEST(wnaf, GetWnafBitsConstLimbBoundary)
{
    // scalar[0] bits 59-63 = 1,0,1,0,1  and  scalar[1] bits 0-4 = 1,0,1,0,1
    // Full bit pattern around the boundary (bit 63 | bit 64):
    //   bit: ...59 60 61 62 63 | 64 65 66 67 68 69...
    //   val: ... 1  0  1  0  1 |  1  0  1  0  1  0...
    const uint64_t scalar[2] = { 0xA800000000000000ULL, 0x0000000000000015ULL };

    // Window starts at bit 63 — straddles the limb boundary (2 bits from lo, 3 from hi)
    // bits 63,64,65,66,67 = 1,1,0,1,0 → 1 + 2 + 0 + 8 + 0 = 11
    EXPECT_EQ((wnaf::get_wnaf_bits_const<5, 63>(scalar)), 11ULL);

    // Window starts at bit 64 — exactly at the hi limb start
    // bits 64,65,66,67,68 = 1,0,1,0,1 → 1 + 0 + 4 + 0 + 16 = 21
    EXPECT_EQ((wnaf::get_wnaf_bits_const<5, 64>(scalar)), 21ULL);

    // Window starts at bit 65 — one past the boundary, entirely in hi limb
    // bits 65,66,67,68,69 = 0,1,0,1,0 → 0 + 2 + 0 + 8 + 0 = 10
    EXPECT_EQ((wnaf::get_wnaf_bits_const<5, 65>(scalar)), 10ULL);
}

TEST(wnaf, WnafPowerOfTwo)
{
    // Powers of 2 are all even (skew = true) and have a single 1-bit with all lower bits zero,
    // so every window below the leading bit is even, forcing borrows to cascade through all rounds.
    auto test_power_of_two_scalar = [](uint64_t lo, uint64_t hi) {
        uint64_t buffer[2] = { lo, hi };
        uint64_t wnaf_out[WNAF_SIZE(5)] = { 0 };
        bool skew = false;
        wnaf::fixed_wnaf<1, 5>(buffer, wnaf_out, skew, 0);
        EXPECT_TRUE(skew); // all powers of 2 are even
        uint64_t recovered_hi = 0;
        uint64_t recovered_lo = 0;
        recover_fixed_wnaf(wnaf_out, skew, recovered_hi, recovered_lo, 5);
        EXPECT_EQ(lo, recovered_lo);
        EXPECT_EQ(hi, recovered_hi);
    };

    test_power_of_two_scalar(2ULL, 0ULL);       // 2^1:   smallest even, borrows cascade through all 26 windows
    test_power_of_two_scalar(1ULL << 32, 0ULL); // 2^32:  mid-lo-limb
    test_power_of_two_scalar(0ULL, 1ULL);       // 2^64:  exactly at the limb boundary
    test_power_of_two_scalar(0ULL, 1ULL << 62); // 2^126: near the 127-bit maximum
}

TEST(wnaf, WnafZero)
{
    uint64_t buffer[2]{ 0, 0 };
    uint64_t wnaf[WNAF_SIZE(5)] = { 0 };
    bool skew = false;
    wnaf::fixed_wnaf<1, 5>(buffer, wnaf, skew, 0);
    uint64_t recovered_hi = 0;
    uint64_t recovered_lo = 0;
    recover_fixed_wnaf(wnaf, skew, recovered_hi, recovered_lo, 5);
    EXPECT_EQ(recovered_lo, 0UL);
    EXPECT_EQ(recovered_hi, 0UL);
    EXPECT_EQ(buffer[0], recovered_lo);
    EXPECT_EQ(buffer[1], recovered_hi);
}

TEST(wnaf, WnafTwoBitWindow)
{
    /**
     * We compute the 2-bit windowed NAF form of `input`.
     */
    uint256_t input = fr::random_element();
    constexpr uint32_t window = 2;
    constexpr uint32_t num_bits = 254;
    constexpr uint32_t num_quads = (num_bits >> 1) + 1;
    uint64_t wnaf[num_quads] = { 0 };
    bool skew = false;
    wnaf::fixed_wnaf<256, 1, window>(&input.data[0], wnaf, skew, 0);

    /**
     * For representing even numbers, we define a skew:
     *
     *        / false   if input is odd
     * skew = |
     *        \ true    if input is even
     *
     * The i-th quad value is defined as:
     *
     *        / -(2b + 1)   if sign = 1
     * q[i] = |
     *        \ (2b + 1)    if sign = 0
     *
     * where sign = ((wnaf[i] >> 31) == 0) and b = (wnaf[i] & 1).
     * We can compute back the original number from the quads as:
     *                127
     *               -----
     *               \
     * R = -skew  +  |    4^{127 - i} . q[i].
     *               /
     *               -----
     *                i=0
     *
     */
    uint256_t recovered = 0;
    uint256_t four_power = (uint256_t(1) << num_bits);
    for (uint64_t i : wnaf) {
        int extracted = 2 * (static_cast<int>(i) & 1) + 1;
        bool sign = (i >> 31) == 0;

        if (sign) {
            recovered += uint256_t(static_cast<uint64_t>(extracted)) * four_power;
        } else {
            recovered -= uint256_t(static_cast<uint64_t>(extracted)) * four_power;
        }
        four_power >>= 2;
    }
    recovered -= static_cast<uint64_t>(skew);
    EXPECT_EQ(recovered, input);
}

TEST(wnaf, WnafFixed)
{
    uint256_t buffer = engine.get_random_uint256();
    buffer.data[1] &= 0x7fffffffffffffffUL;
    uint64_t wnaf[WNAF_SIZE(5)] = { 0 };
    bool skew = false;
    wnaf::fixed_wnaf<1, 5>(&buffer.data[0], wnaf, skew, 0);
    uint64_t recovered_hi = 0;
    uint64_t recovered_lo = 0;
    recover_fixed_wnaf(wnaf, skew, recovered_hi, recovered_lo, 5);
    EXPECT_EQ(buffer.data[0], recovered_lo);
    EXPECT_EQ(buffer.data[1], recovered_hi);
}

TEST(wnaf, WnafFixedSimpleLo)
{
    uint64_t rand_buffer[2]{ 1, 0 };
    uint64_t wnaf[WNAF_SIZE(5)]{ 0 };
    bool skew = false;
    wnaf::fixed_wnaf<1, 5>(rand_buffer, wnaf, skew, 0);
    uint64_t recovered_hi = 0;
    uint64_t recovered_lo = 0;
    recover_fixed_wnaf(wnaf, skew, recovered_hi, recovered_lo, 5);
    EXPECT_EQ(rand_buffer[0], recovered_lo);
    EXPECT_EQ(rand_buffer[1], recovered_hi);
}

TEST(wnaf, WnafFixedSimpleHi)
{
    uint64_t rand_buffer[2] = { 0, 1 };
    uint64_t wnaf[WNAF_SIZE(5)] = { 0 };
    bool skew = false;
    wnaf::fixed_wnaf<1, 5>(rand_buffer, wnaf, skew, 0);
    uint64_t recovered_hi = 0;
    uint64_t recovered_lo = 0;
    recover_fixed_wnaf(wnaf, skew, recovered_hi, recovered_lo, 5);
    EXPECT_EQ(rand_buffer[0], recovered_lo);
    EXPECT_EQ(rand_buffer[1], recovered_hi);
}

TEST(wnaf, WnafFixedWithEndoSplit)
{
    fr k = engine.get_random_uint256();
    k.data[3] &= 0x0fffffffffffffffUL;

    fr k1{ 0, 0, 0, 0 };
    fr k2{ 0, 0, 0, 0 };

    fr::split_into_endomorphism_scalars(k, k1, k2);
    uint64_t wnaf[WNAF_SIZE(5)] = { 0 };
    uint64_t endo_wnaf[WNAF_SIZE(5)] = { 0 };
    bool skew = false;
    bool endo_skew = false;
    wnaf::fixed_wnaf<1, 5>(&k1.data[0], wnaf, skew, 0);
    wnaf::fixed_wnaf<1, 5>(&k2.data[0], endo_wnaf, endo_skew, 0);

    fr k1_recovered{ 0, 0, 0, 0 };
    fr k2_recovered{ 0, 0, 0, 0 };

    recover_fixed_wnaf(wnaf, skew, k1_recovered.data[1], k1_recovered.data[0], 5);
    recover_fixed_wnaf(endo_wnaf, endo_skew, k2_recovered.data[1], k2_recovered.data[0], 5);

    fr result;
    fr lambda = fr::cube_root_of_unity();
    result = k2_recovered * lambda;
    result = k1_recovered - result;

    EXPECT_EQ(result, k);
}

// NOLINTEND(cppcoreguidelines-avoid-c-arrays)
