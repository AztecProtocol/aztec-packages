#include "barretenberg/ecc/fields/field_conversion_utils.hpp"
#include <gtest/gtest.h>

namespace bb::field_conversion_utils_tests {

class FieldConversionUtilsTest : public ::testing::Test {
  public:
    template <typename T> void check_conversion(T x)
    {
        size_t len = bb::field_conversion_utils::calc_num_frs<T>();
        auto frs = bb::field_conversion_utils::convert_to_bn254_frs(x);
        EXPECT_EQ(len, frs.size());
        auto y = bb::field_conversion_utils::convert_from_bn254_frs<T>(frs);
        EXPECT_EQ(x, y);
    }
};

/**
 * @brief Field conversion test for size_t
 */
TEST_F(FieldConversionUtilsTest, FieldConversionSizeT)
{
    size_t x = 210849;
    check_conversion(x);
}

/**
 * @brief Field conversion test for uint32_t
 */
TEST_F(FieldConversionUtilsTest, FieldConversionUint32)
{
    auto x = static_cast<uint32_t>(1) << 31;
    check_conversion(x);
}

/**
 * @brief Field conversion test for bb::fr
 */
TEST_F(FieldConversionUtilsTest, FieldConversionFr)
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
TEST_F(FieldConversionUtilsTest, FieldConversionGrumpkinFr)
{
    grumpkin::fr x1(std::string("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789")); // 256 bits
    check_conversion(x1);
}

/**
 * @brief Field conversion test for curve::BN254::AffineElement
 *
 */
TEST_F(FieldConversionUtilsTest, FieldConversionBN254AffineElement)
{
    curve::BN254::AffineElement x1(1, 2);
    check_conversion(x1);

    curve::BN254::AffineElement x2(grumpkin::fr::modulus_minus_two, grumpkin::fr::modulus_minus_two);
    check_conversion(x2);
}

/**
 * @brief Field conversion test for curve::Grumpkin::AffineElement
 */
TEST_F(FieldConversionUtilsTest, FieldConversionGrumpkinAffineElement)
{
    curve::Grumpkin::AffineElement x1(1, 2);
    check_conversion(x1);

    curve::Grumpkin::AffineElement x2(bb::fr::modulus_minus_two, bb::fr::modulus_minus_two);
    check_conversion(x2);
}

/**
 * @brief Field
 *
 */

} // namespace bb::field_conversion_utils_tests