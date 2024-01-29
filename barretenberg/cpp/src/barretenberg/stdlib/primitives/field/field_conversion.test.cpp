#include "barretenberg/stdlib/primitives/field/field_conversion.hpp"
#include <gtest/gtest.h>

namespace bb::stdlib::field_conversion_tests {

template <typename Builder> using fr = field_t<Builder>;
template <typename Builder> using fq = bigfield<Builder, bb::Bn254FqParams>;
template <typename Builder> using bn254_element = element<Builder, fq<Builder>, fr<Builder>, curve::BN254::Group>;

template <typename Builder> class StdlibFieldConversionTests : public ::testing::Test {
  public:
    template <typename T> void check_conversion(Builder& builder, T x)
    {
        size_t len = bb::stdlib::field_conversion::calc_num_bn254_frs<T>();
        auto frs = bb::stdlib::field_conversion::convert_to_bn254_frs(x);
        EXPECT_EQ(len, frs.size());
        auto y = bb::stdlib::field_conversion::convert_from_bn254_frs<Builder, T>(builder, frs);
        EXPECT_EQ(x.get_value(), y.get_value());
    }

    template <typename T> void check_conversion_iterable(Builder& builder, T x)
    {
        size_t len = bb::stdlib::field_conversion::calc_num_bn254_frs<T>();
        auto frs = bb::stdlib::field_conversion::convert_to_bn254_frs(x);
        EXPECT_EQ(len, frs.size());
        auto y = bb::stdlib::field_conversion::convert_from_bn254_frs<Builder, T>(builder, frs);
        for (size_t i = 0; i < x.size(); i++) {
            EXPECT_EQ(x[i].get_value(), y[i].get_value());
        }
    }
};

using BuilderTypes = testing::Types<UltraCircuitBuilder, GoblinUltraCircuitBuilder>;

TYPED_TEST_SUITE(StdlibFieldConversionTests, BuilderTypes);

// /**
//  * @brief Field conversion test for size_t
//  */
// TYPED_TEST(StdlibFieldConversionTests, FieldConversionSizeT)
// {
//     size_t x = 210849;
//     this->check_conversion(builder, x);
// }

// /**
//  * @brief Field conversion test for uint32_t
//  */
// TYPED_TEST(StdlibFieldConversionTests, FieldConversionUint32)
// {
//     auto x = static_cast<uint32_t>(1) << 31;
//     this->check_conversion(builder, x);
// }

/**
 * @brief Field conversion test for fr<Builder>
 */
TYPED_TEST(StdlibFieldConversionTests, FieldConversionFr)
{
    using Builder = TypeParam;
    Builder builder;
    bb::fr x1_val(std::string("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789")); // 256 bits
    fr<Builder> x1(&builder, x1_val);
    this->check_conversion(builder, x1);

    bb::fr x2_val(bb::fr::modulus_minus_two); // modulus - 2
    fr<Builder> x2(&builder, x2_val);
    this->check_conversion(builder, x2);
}

/**
 * @brief Field conversion test for fq<Builder>
 */
TYPED_TEST(StdlibFieldConversionTests, FieldConversionGrumpkinFr)
{
    using Builder = TypeParam;
    Builder builder;

    // Constructing bigfield objects with grumpkin::fr values
    grumpkin::fr x1_val(std::string("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789")); // 256 bits
    fq<Builder> x1(&builder, x1_val);
    this->check_conversion(builder, x1);
}

/**
 * @brief Field conversion test for bn254_element<Builder>
 *
 */
TYPED_TEST(StdlibFieldConversionTests, FieldConversionBN254AffineElement)
{
    using Builder = TypeParam;
    Builder builder;

    // Constructing element objects with curve::BN254::AffineElement values
    curve::BN254::AffineElement x1_val(1, 2);
    bn254_element<Builder> x1 = bn254_element<Builder>::from_witness(&builder, x1_val);
    this->check_conversion(builder, x1);

    curve::BN254::AffineElement x2_val(1, grumpkin::fr::modulus_minus_two);
    bn254_element<Builder> x2 = bn254_element<Builder>::from_witness(&builder, x2_val);
    this->check_conversion(builder, x2);
}

// /**
//  * @brief Field conversion test for element<Builder, fq<Builder>, fr<Builder>, curve::Grumpkin::Group>
//  */
// TYPED_TEST(StdlibFieldConversionTests, FieldConversionGrumpkinAffineElement)
// {
//     using Builder = TypeParam;
//     Builder builder;

//     // Constructing element objects with curve::Grumpkin::AffineElement values
//     curve::Grumpkin::AffineElement x1_val(1, 2);
//     element<Builder, fq<Builder>, fr<Builder>, curve::Grumpkin::Group> x1(&builder, x1_val);
//     this->check_conversion(builder, x1);

//     curve::Grumpkin::AffineElement x2_val(bb::fr::modulus_minus_two, bb::fr::modulus_minus_two);
//     element<Builder, fq<Builder>, fr<Builder>, curve::Grumpkin::Group> x2(&builder, x2_val);
//     this->check_conversion(builder, x2);
// }

/**
 * @brief Field conversion test for std::array<fr<Builder>, N>
 */
TYPED_TEST(StdlibFieldConversionTests, FieldConversionArrayBn254Fr)
{
    using Builder = TypeParam;
    Builder builder;

    // Constructing std::array objects with fr<Builder> values
    std::array<fr<Builder>, 4> x1_val{
        fr<Builder>(&builder, 1), fr<Builder>(&builder, 2), fr<Builder>(&builder, 3), fr<Builder>(&builder, 4)
    };
    std::array<fr<Builder>, 4> x1(x1_val);
    this->check_conversion_iterable(builder, x1);

    std::array<fr<Builder>, 7> x2_val{ fr<Builder>(&builder, bb::fr::modulus_minus_two),
                                       fr<Builder>(&builder, bb::fr::modulus_minus_two - 123),
                                       fr<Builder>(&builder, 215215125),
                                       fr<Builder>(&builder, 102701750),
                                       fr<Builder>(&builder, 367032),
                                       fr<Builder>(&builder, 12985028),
                                       fr<Builder>(&builder, bb::fr::modulus_minus_two - 125015028) };
    std::array<fr<Builder>, 7> x2(x2_val);
    this->check_conversion_iterable(builder, x2);
}

// /**
//  * @brief Field conversion test for std::array<fq<Builder>, N>
//  */
// TYPED_TEST(StdlibFieldConversionTests, FieldConversionArrayGrumpkinFr)
// {
//     using Builder = TypeParam;
//     Builder builder;

//     // Constructing std::array objects with fq<Builder> values
//     std::array<fq<Builder>, 4> x1_val{
//         fq<Builder>(
//             static_cast<grumpkin::fr>(std::string("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"))),
//         static_cast<grumpkin::fr>(std::string(fq<Builder>(std::string("123456789abcdef")))),
//         fq<Builder>(static_cast<grumpkin::fr>(std::string(std::string("9876543210abcdef")))),
//         fq<Builder>(static_cast<grumpkin::fr>(std::string(std::string("fedcba9876543210abcdef"))))
//     };
//     std::array<fq<Builder>, 4> x1(x1_val);
//     this->check_conversion_iterable(builder, x1);

//     std::array<fq<Builder>, 7> x2_val{
//         fq<Builder>(std::string("9a807b615c4d3e2fa0")), fq<Builder>(std::string("1c2d3e4f56789fedcba")),
//         fq<Builder>(std::string("b1c2d3e4f56789")),     fq<Builder>(std::string("fedcba9876543210")),
//         fq<Builder>(std::string("abcdef0123456789")),   fq<Builder>(std::string("123456789abcdef")),
//         fq<Builder>(std::string("9876543210abcdef"))
//     };
//     std::array<fq<Builder>, 7> x2(x2_val);
//     this->check_conversion_iterable(builder, x2);
// }
} // namespace bb::stdlib::field_conversion_tests