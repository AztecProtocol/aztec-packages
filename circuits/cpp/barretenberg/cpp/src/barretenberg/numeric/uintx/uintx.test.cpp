#include "../random/engine.hpp"
#include "./uintx.hpp"
#include <gtest/gtest.h>

namespace {
auto& engine = numeric::random::get_debug_engine();
} // namespace

TEST(uintx, get_bit)
{
    constexpr uint256_t lo{ 0b0110011001110010011001100111001001100110011100100110011001110011,
                            0b1001011101101010101010100100101101101001001010010101110101010111,
                            0b0101010010010101111100001011011010101010110101110110110111010101,
                            0b0101011010101010100010001000101011010101010101010010000100000000 };

    constexpr uint256_t hi{ 0b0110011001110010011001100111001001100110011100100110011001110011,
                            0b1001011101101010101010100100101101101001001010010101110101010111,
                            0b0101010010010101111100001011011010101010110101110110110111010101,
                            0b0101011010101010100010001000101011010101010101010010000100000000 };

    constexpr uint1024_t a(uint512_t(lo, hi), uint512_t(lo, hi));
    uint1024_t res(0);
    for (size_t i = 0; i < 1024; ++i) {
        res += a.get_bit(i) ? (uint1024_t(1) << i) : 0;
    }

    EXPECT_EQ(a, res);
}

TEST(uintx, mul)
{
    uint1024_t a = engine.get_random_uint1024();
    uint1024_t b = engine.get_random_uint1024();

    uint1024_t c = (a + b) * (a + b);
    uint1024_t d = (a * a) + (b * b) + (a * b) + (a * b);
    EXPECT_EQ(c, d);
}

TEST(uintx, div_and_mod)
{
    for (size_t i = 0; i < 256; ++i) {
        uint1024_t a = engine.get_random_uint1024();
        uint1024_t b = engine.get_random_uint1024();

        uint1024_t q = a / b;
        uint1024_t r = a % b;

        uint1024_t c = q * b + r;
        EXPECT_EQ(c, a);
    }

    uint1024_t b = engine.get_random_uint1024();
    uint1024_t a = 0;
    // Since we have an ASSERT in div_mod now we have to use EXPECT_DEATH
    // but we don't want to use it, so we skip the division by zero check

    // b = a;
    auto q = a / b;
    auto r = a % b;

    EXPECT_EQ(q, uint1024_t(0));
    EXPECT_EQ(r, uint1024_t(0));
}

// We should not be depending on ecc in numeric.
TEST(uintx, DISABLED_mulmod)
{
    /*
        barretenberg::fq a = barretenberg::fq::random_element();
        barretenberg::fq b = barretenberg::fq::random_element();
        // barretenberg::fq a_converted = a.from_montgomery_form();
        // barretenberg::fq b_converted = b.from_montgomery_form();
        uint256_t a_uint =
            uint256_t(a); // { a_converted.data[0], a_converted.data[1], a_converted.data[2], a_converted.data[3] };
        uint256_t b_uint =
            uint256_t(b); // { b_converted.data[0], b_converted.data[1], b_converted.data[2], b_converted.data[3] };
        uint256_t modulus_uint{ barretenberg::Bn254FqParams::modulus_0,
                                barretenberg::Bn254FqParams::modulus_1,
                                barretenberg::Bn254FqParams::modulus_2,
                                barretenberg::Bn254FqParams::modulus_3 };
        uint1024_t a_uintx = uint1024_t(uint512_t(a_uint));
        uint1024_t b_uintx = uint1024_t(uint512_t(b_uint));
        uint1024_t modulus_uintx = uint1024_t(uint512_t(modulus_uint));

        const auto [quotient, remainder] = (a_uintx * b_uintx).divmod(modulus_uintx);

        // barretenberg::fq expected_a = a_converted.to_montgomery_form();
        // barretenberg::fq expected_b = b_converted.to_montgomery_form();
        barretenberg::fq expected = (a * b).from_montgomery_form();

        EXPECT_EQ(remainder.lo.lo.data[0], expected.data[0]);
        EXPECT_EQ(remainder.lo.lo.data[1], expected.data[1]);
        EXPECT_EQ(remainder.lo.lo.data[2], expected.data[2]);
        EXPECT_EQ(remainder.lo.lo.data[3], expected.data[3]);

        const auto rhs = (quotient * modulus_uintx) + remainder;
        const auto lhs = a_uintx * b_uintx;
        EXPECT_EQ(lhs, rhs);
    */
}

TEST(uintx, sub)
{
    uint1024_t a = engine.get_random_uint1024();
    uint1024_t b = engine.get_random_uint1024();

    uint1024_t c = (a - b) * (a + b);
    uint1024_t d = (a * a) - (b * b);

    EXPECT_EQ(c, d);

    uint1024_t e = 0;
    e = e - 1;

    EXPECT_EQ(e.lo.lo.data[0], UINT64_MAX);
    EXPECT_EQ(e.lo.lo.data[1], UINT64_MAX);
    EXPECT_EQ(e.lo.lo.data[2], UINT64_MAX);
    EXPECT_EQ(e.lo.lo.data[3], UINT64_MAX);
    EXPECT_EQ(e.lo.hi.data[0], UINT64_MAX);
    EXPECT_EQ(e.lo.hi.data[1], UINT64_MAX);
    EXPECT_EQ(e.lo.hi.data[2], UINT64_MAX);
    EXPECT_EQ(e.lo.hi.data[3], UINT64_MAX);
    EXPECT_EQ(e.hi.lo.data[0], UINT64_MAX);
    EXPECT_EQ(e.hi.lo.data[1], UINT64_MAX);
    EXPECT_EQ(e.hi.lo.data[2], UINT64_MAX);
    EXPECT_EQ(e.hi.lo.data[3], UINT64_MAX);
    EXPECT_EQ(e.hi.hi.data[0], UINT64_MAX);
    EXPECT_EQ(e.hi.hi.data[1], UINT64_MAX);
    EXPECT_EQ(e.hi.hi.data[2], UINT64_MAX);
    EXPECT_EQ(e.hi.hi.data[3], UINT64_MAX);
}

TEST(uintx, and)
{
    uint1024_t a = engine.get_random_uint1024();
    uint1024_t b = engine.get_random_uint1024();

    uint1024_t c = a & b;

    EXPECT_EQ(c.lo, a.lo & b.lo);
    EXPECT_EQ(c.hi, a.hi & b.hi);
}

TEST(uintx, or)
{
    uint1024_t a = engine.get_random_uint1024();
    uint1024_t b = engine.get_random_uint1024();

    uint1024_t c = a | b;

    EXPECT_EQ(c.lo, a.lo | b.lo);
    EXPECT_EQ(c.hi, a.hi | b.hi);
}

TEST(uintx, xor)
{
    uint1024_t a = engine.get_random_uint1024();
    uint1024_t b = engine.get_random_uint1024();

    uint1024_t c = a ^ b;

    EXPECT_EQ(c.lo, a.lo ^ b.lo);
    EXPECT_EQ(c.hi, a.hi ^ b.hi);
}

TEST(uintx, bit_not)
{
    uint1024_t a = engine.get_random_uint1024();

    uint1024_t c = ~a;

    EXPECT_EQ(c.lo, ~a.lo);
    EXPECT_EQ(c.hi, ~a.hi);
}

TEST(uintx, logic_not)
{
    uint1024_t a(1);

    bool b = !a;

    EXPECT_EQ(b, false);

    uint1024_t c(0);

    EXPECT_EQ(!c, true);
}

TEST(uintx, not_equal)
{
    uint1024_t a(1);
    uint1024_t b(1);
    EXPECT_EQ(a != b, false);

    a = uint1024_t(0);
    EXPECT_EQ(a != b, true);
}

// We should not be depending on ecc in numeric.
TEST(uintx, DISABLED_invmod)
{
    /*
    uint256_t prime_lo = prime_256;
    uint1024_t prime = uint1024_t(uint512_t(prime_lo));
    uint256_t target_lo = engine.get_random_uint256();
    uint1024_t target = uint1024_t(uint512_t(target_lo));
    uint256_t inverse = uint256_t(uint512_t(target.invmod(prime)));

    uint256_t expected = uint256_t(fr(target_lo).invert());
    EXPECT_EQ(inverse, expected);
    */
}

TEST(uintx, invmod_regression_check)
{
    const uint8_t _a[] = { 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x28, 0x0D, 0x6A, 0x2B, 0x19, 0x52,
                           0x2D, 0xF7, 0xAF, 0xC7, 0x95, 0x68, 0x22, 0xD7, 0xF2, 0x21, 0xA3, 0x00, 0x00,
                           0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                           0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                           0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 };

    const uint8_t _b[] = { 0xFF, 0x00, 0xFF, 0xFF, 0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0x5D, 0x32, 0xDA, 0x10,
                           0x4F, 0x1D, 0xD6, 0xCA, 0x50, 0x56, 0x11, 0x18, 0x18, 0xC2, 0xD4, 0x6C, 0x70,
                           0x60, 0xD9, 0xB8, 0xFA, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                           0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xE2, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
                           0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x01, 0xFF, 0xFF, 0xFF, 0xFF };

    const uint8_t expected_result[] = {
        0x9F, 0x2F, 0xAA, 0x7B, 0xD7, 0x5A, 0x99, 0x56, 0x04, 0x68, 0x6C, 0x9D, 0xD8, 0x47, 0x6B, 0x52,
        0xF0, 0x10, 0xD2, 0xA8, 0x62, 0x96, 0x60, 0x68, 0xBE, 0x18, 0x21, 0xA1, 0xCA, 0x6F, 0x41, 0x9C,
        0x37, 0x42, 0x2F, 0xA3, 0x1B, 0x41, 0x7B, 0xAA, 0xEE, 0x6D, 0x9E, 0x03, 0x78, 0x71, 0xEF, 0xCF,
        0x90, 0x85, 0xEF, 0x17, 0x59, 0xC4, 0xEE, 0x24, 0x80, 0xDE, 0x7A, 0x58, 0xA5, 0x42, 0x8F, 0x97,
    };

    uint8_t _res[64];

    uint512_t a, b;

    memcpy(a.lo.data, _a, 32);
    memcpy(a.hi.data, _a + 32, 32);

    memcpy(b.lo.data, _b, 32);
    memcpy(b.hi.data, _b + 32, 32);
    const auto res = a.invmod(b);
    memcpy(_res, res.lo.data, 32);
    memcpy(_res + 32, res.hi.data, 32);

    EXPECT_EQ(memcmp(_res, expected_result, sizeof(expected_result)), 0);
}
TEST(uintx, DISABLED_r_inv)
{
    /*
    uint512_t r{ 0, 1 };
    // -(1/q) mod r
    uint512_t q{ -prime_256, 0 };
    uint256_t q_inv = q.invmod(r).lo;
    uint64_t result = q_inv.data[0];
    EXPECT_EQ(result, Bn254FrParams::r_inv);
    */
}