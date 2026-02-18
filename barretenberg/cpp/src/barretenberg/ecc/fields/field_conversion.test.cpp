#include "barretenberg/ecc/fields/field_conversion.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include <gtest/gtest.h>

namespace bb::field_conversion_tests {

class FieldConversionTest : public ::testing::Test {
  public:
    template <typename T> void check_conversion(T x)
    {
        size_t len = FrCodec::calc_num_fields<T>();
        auto frs = FrCodec::serialize_to_fields(x);
        EXPECT_EQ(len, frs.size());
        auto y = FrCodec::deserialize_from_fields<T>(frs);
        EXPECT_EQ(x, y);
    }
};

/**
 * @brief Field conversion test for uint32_t
 */
TEST_F(FieldConversionTest, FieldConversionUint32)
{
    auto x = static_cast<uint32_t>(1) << 31;
    check_conversion(x);
}

/**
 * @brief Field conversion test for bb::fr
 */
TEST_F(FieldConversionTest, FieldConversionFr)
{
    bb::fr x1(std::string("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789")); // 256 bits
    check_conversion(x1);

    bb::fr x2(bb::fr::modulus_minus_two); // modulus - 2
    check_conversion(x2);
}

/**
 * @brief Field conversion test for grumpkin::fr
 *
 */
TEST_F(FieldConversionTest, FieldConversionGrumpkinFr)
{
    grumpkin::fr x1(std::string("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789")); // 256 bits
    check_conversion(x1);
}

namespace {
bb::fq derive_bn254_y(bb::fq x)
{
    auto [found, y] = (x.sqr() * x + Bn254G1Params::b).sqrt();
    EXPECT_TRUE(found);
    return y;
}
} // namespace

/**
 * @brief Field conversion test for curve::BN254::AffineElement
 *
 */
TEST_F(FieldConversionTest, FieldConversionBN254AffineElement)
{
    curve::BN254::AffineElement x1(1, derive_bn254_y(1));
    check_conversion(x1);

    curve::BN254::AffineElement x2(grumpkin::fr::modulus_minus_two, derive_bn254_y(grumpkin::fr::modulus_minus_two));
    check_conversion(x2);
}

namespace {
bb::grumpkin::fq derive_grumpkin_y(bb::grumpkin::fq x)
{
    auto [found, y] = (x.sqr() * x + grumpkin::G1Params::b + x * grumpkin::G1Params::a).sqrt();
    EXPECT_TRUE(found);
    return y;
}
} // namespace

/**
 * @brief Field conversion test for curve::Grumpkin::AffineElement
 */
TEST_F(FieldConversionTest, FieldConversionGrumpkinAffineElement)
{
    curve::Grumpkin::AffineElement x1(1, derive_grumpkin_y(1));
    check_conversion(x1);

    curve::Grumpkin::AffineElement x2(bb::fr::modulus_minus_two, derive_grumpkin_y(bb::fr::modulus_minus_two));
    check_conversion(x2);
}

/**
 * @brief Field conversion test for std::array<bb::fr, N>
 *
 */
TEST_F(FieldConversionTest, FieldConversionArrayBn254Fr)
{
    std::array<bb::fr, 4> x1{ 1, 2, 3, 4 };
    check_conversion(x1);

    std::array<bb::fr, 7> x2{ bb::fr::modulus_minus_two,
                              bb::fr::modulus_minus_two - 123,
                              215215125,
                              102701750,
                              367032,
                              12985028,
                              bb::fr::modulus_minus_two - 125015028 };
    check_conversion(x2);
}

/**
 * @brief Field conversion test for std::array<grumpkin::fr, N>
 *
 */
TEST_F(FieldConversionTest, FieldConversionArrayGrumpkinFr)
{
    std::array<grumpkin::fr, 4> x1{ 1, 2, 3, 4 };
    check_conversion(x1);

    std::array<grumpkin::fr, 7> x2{ grumpkin::fr::modulus_minus_two,
                                    grumpkin::fr::modulus_minus_two - 123,
                                    215215125,
                                    102701750,
                                    367032,
                                    12985028,
                                    grumpkin::fr::modulus_minus_two - 125015028 };
    check_conversion(x2);
}

/**
 * @brief Field conversion test for bb::Univariate<bb::fr, N>
 *
 */
TEST_F(FieldConversionTest, FieldConversionUnivariateBn254Fr)
{
    std::array<bb::fr, 4> x1_arr{ 1, 2, 3, 4 };
    bb::Univariate<bb::fr, 4> x1{ x1_arr };
    check_conversion(x1);
}

/**
 * @brief Field conversion test for bb::Univariate<grumpkin::fr, N>
 *
 */
TEST_F(FieldConversionTest, FieldConversionUnivariateGrumpkinFr)
{
    std::array<grumpkin::fr, 4> x1_arr{ 1, 2, 3, 4 };
    bb::Univariate<grumpkin::fr, 4> x1{ x1_arr };
    check_conversion(x1);
}

/**
 * @brief Convert challenge test for grumpkin::fr
 *
 */
TEST_F(FieldConversionTest, ConvertChallengeGrumpkinFr)
{
    uint256_t chal_raw(std::string("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789")); // 256 bits
    bb::fr chal(chal_raw.slice(0, 136));
    auto result = FrCodec::convert_challenge<grumpkin::fr>(chal);
    auto expected = uint256_t(chal);
    EXPECT_EQ(uint256_t(result), expected);
}

// ============================================================================
// Additional FrCodec-specific tests
// Note: Most rejection/acceptance tests are in stdlib/primitives/field/field_conversion.test.cpp
// which tests both FrCodec and StdlibCodec together for consistency.
// ============================================================================

/**
 * @brief Test that valid canonical (0, 0) is accepted as point at infinity.
 * @details This ensures we're only rejecting non-canonical aliases, not the proper encoding.
 */
TEST_F(FieldConversionTest, AcceptCanonicalPointAtInfinity)
{
    // Test for BN254 points
    {
        std::vector<bb::fr> fr_vec = { bb::fr(0), bb::fr(0), bb::fr(0), bb::fr(0) };
        auto point = FrCodec::deserialize_from_fields<curve::BN254::AffineElement>(fr_vec);
        EXPECT_TRUE(point.is_point_at_infinity());
    }

    // Test for Grumpkin points
    {
        std::vector<bb::fr> fr_vec = { bb::fr(0), bb::fr(0) };
        auto point = FrCodec::deserialize_from_fields<curve::Grumpkin::AffineElement>(fr_vec);
        EXPECT_TRUE(point.is_point_at_infinity());
    }
}

/**
 * @brief Test that non-canonical field elements are rejected at deserialization boundaries.
 * @details Security-critical: prevents attackers from using aliased encodings (e.g., modulus instead of 0).
 * @note Skipped in WASM builds because death tests aren't supported.
 */
#ifndef __wasm__
TEST_F(FieldConversionTest, RejectNonCanonicalFieldElements)
{
    using BN254Point = curve::BN254::AffineElement;
    using GrumpkinPoint = curve::Grumpkin::AffineElement;
    using fq = curve::BN254::BaseField;
    using gq = curve::Grumpkin::BaseField;

    // BN254: Reject x-coordinate >= modulus
    {
        std::vector<bb::fr> vec = { bb::fr(fq::modulus.data[0]), bb::fr(fq::modulus.data[1]), bb::fr(0), bb::fr(0) };
        EXPECT_THROW_OR_ABORT(FrCodec::deserialize_from_fields<BN254Point>(vec), "canonical");
    }

    // BN254: Reject y-coordinate >= modulus
    {
        std::vector<bb::fr> vec = { bb::fr(0), bb::fr(0), bb::fr(fq::modulus.data[0]), bb::fr(fq::modulus.data[1]) };
        EXPECT_THROW_OR_ABORT(FrCodec::deserialize_from_fields<BN254Point>(vec), "canonical");
    }

    // BN254: Reject both coordinates >= modulus
    {
        std::vector<bb::fr> vec = { bb::fr(fq::modulus.data[0]),
                                    bb::fr(fq::modulus.data[1]),
                                    bb::fr(fq::modulus.data[0]),
                                    bb::fr(fq::modulus.data[1]) };
        EXPECT_THROW_OR_ABORT(FrCodec::deserialize_from_fields<BN254Point>(vec), "canonical");
    }

    // Grumpkin: Reject coordinate >= modulus (uses 2-limb encoding: 136-bit + 118-bit)
    {
        constexpr uint64_t LIMB_BITS = 68;
        uint256_t gq_lo = gq::modulus & ((uint256_t(1) << (LIMB_BITS * 2)) - 1);
        uint256_t gq_hi = gq::modulus >> (LIMB_BITS * 2);
        std::vector<bb::fr> vec = { bb::fr(gq_lo), bb::fr(gq_hi) };
        EXPECT_THROW_OR_ABORT(FrCodec::deserialize_from_fields<GrumpkinPoint>(vec), "canonical");
    }

    // Grumpkin: Reject limb overflow (lower limb must be < 2^136)
    {
        constexpr uint64_t LIMB_BITS = 68;
        std::vector<bb::fr> vec = { bb::fr(uint256_t(1) << (LIMB_BITS * 2)), bb::fr(0) };
        EXPECT_THROW_OR_ABORT(FrCodec::deserialize_from_fields<GrumpkinPoint>(vec), "Conversion error");
    }

    // Grumpkin: Reject limb overflow (upper limb must be < 2^118)
    {
        constexpr uint64_t LIMB_BITS = 68;
        std::vector<bb::fr> vec = { bb::fr(0), bb::fr(uint256_t(1) << (254 - LIMB_BITS * 2)) };
        EXPECT_THROW_OR_ABORT(FrCodec::deserialize_from_fields<GrumpkinPoint>(vec), "Conversion error");
    }
}
#endif

/**
 * @brief Test that points not on the curve are rejected.
 * @note Skipped in WASM builds because death tests (EXPECT_DEATH) aren't supported.
 */
#ifndef __wasm__
TEST_F(FieldConversionTest, RejectPointNotOnCurve)
{
    // Test for BN254: (1, 4) is not on the curve
    {
        std::vector<bb::fr> fr_vec = { bb::fr(1), bb::fr(0), bb::fr(4), bb::fr(0) };
        EXPECT_THROW_OR_ABORT(FrCodec::deserialize_from_fields<curve::BN254::AffineElement>(fr_vec), "on_curve");
    }

    // Test for Grumpkin: (12, 100) is not on the curve
    {
        std::vector<bb::fr> fr_vec = { bb::fr(12), bb::fr(100) };
        EXPECT_THROW_OR_ABORT(FrCodec::deserialize_from_fields<curve::Grumpkin::AffineElement>(fr_vec), "on_curve");
    }
}
#endif

} // namespace bb::field_conversion_tests
