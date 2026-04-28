#include "barretenberg/serialize/msgpack_impl.hpp"

#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/ecc/curves/secp256k1/secp256k1.hpp"
#include "barretenberg/ecc/curves/secp256r1/secp256r1.hpp"
#include "barretenberg/ecc/fields/field_conversion.hpp"
#include "barretenberg/ecc/groups/element.hpp"
#include "barretenberg/serialize/test_helper.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"

#include "gmock/gmock.h"
#include <algorithm>
#include <fstream>
#include <gtest/gtest.h>
#include <iterator>
#include <tuple>

using ::testing::Each;
using ::testing::ElementsAreArray;
using ::testing::Eq;
using ::testing::Property;

using namespace bb;

namespace {
template <typename G1> class TestAffineElement : public testing::Test {
    using element = typename G1::element;
    using affine_element = typename G1::affine_element;
    using Fr = typename G1::Fr;

  public:
    static void test_read_write_buffer()
    {
        // a generic point
        {
            affine_element P = affine_element(element::random_element());
            affine_element R;

            std::vector<uint8_t> v(64);
            uint8_t* ptr = v.data();
            affine_element::serialize_to_buffer(P, ptr);

            R = affine_element::serialize_from_buffer(ptr);
            ASSERT_TRUE(R.on_curve());
            ASSERT_TRUE(P == R);
        }

        // point at infinity
        {
            affine_element P = affine_element(element::random_element());
            P.self_set_infinity();
            affine_element R;

            std::vector<uint8_t> v(64);
            uint8_t* ptr = v.data();
            affine_element::serialize_to_buffer(P, ptr);

            R = affine_element::serialize_from_buffer(ptr);
            ASSERT_TRUE(R.is_point_at_infinity());
            ASSERT_TRUE(P == R);
        }
    }

    // Verify that serialize_from_buffer rejects off-curve bytes by throwing.
    static void test_deserialize_off_curve_throws()
    {
        using Fq = typename G1::Fq;
        // Take a valid on-curve point and corrupt its y-coordinate.
        // P.y + 1 satisfies (y+1)^2 != y^2 (i.e. off-curve) unless 2y + 1 = 0 (prob ~1/p).
        affine_element P = affine_element(element::random_element());
        affine_element off_curve;
        off_curve.x = P.x;
        off_curve.y = P.y + Fq::one();

        std::vector<uint8_t> v(sizeof(affine_element));
        uint8_t* ptr = v.data();
        affine_element::serialize_to_buffer(off_curve, ptr);

        if (!off_curve.on_curve()) {
#ifndef __wasm__
            EXPECT_THROW_OR_ABORT(affine_element::serialize_from_buffer(ptr), "not on the curve");
#endif
        }
    }

    static void test_read_and_write()
    {
        // a generic point
        {
            affine_element P = affine_element(element::random_element());
            [[maybe_unused]] affine_element R;

            std::vector<uint8_t> v(sizeof(R));
            uint8_t* ptr = v.data();
            write(ptr, P);
            ASSERT_TRUE(P.on_curve());

            // // Reset to start?
            // ptr = v.data();

            const uint8_t* read_ptr = v.data();
            // good read
            read(read_ptr, R);
            ASSERT_TRUE(R.on_curve());
            ASSERT_TRUE(P == R);
        }
    }

    static void test_msgpack_serialization()
    {
        // a generic point
        {
            affine_element P = affine_element(element::random_element());

            // Serialize using msgpack
            msgpack::sbuffer sbuf;
            msgpack::pack(sbuf, P);

            // Deserialize using msgpack
            msgpack::object_handle oh = msgpack::unpack(sbuf.data(), sbuf.size());
            msgpack::object deserialized = oh.get();

            affine_element R;
            deserialized.convert(R);

            ASSERT_TRUE(R.on_curve() && !R.is_point_at_infinity());
            ASSERT_TRUE(P == R);
        }

        // point at infinity
        {
            affine_element P = affine_element(element::random_element());
            P.self_set_infinity();

            // Serialize using msgpack
            msgpack::sbuffer sbuf;
            msgpack::pack(sbuf, P);

            // Deserialize using msgpack
            msgpack::object_handle oh = msgpack::unpack(sbuf.data(), sbuf.size());
            msgpack::object deserialized = oh.get();

            affine_element R;
            deserialized.convert(R);

            ASSERT_TRUE(R.is_point_at_infinity());
            ASSERT_TRUE(P == R);
        }
    }

    static void test_point_compression()
    {
        for (size_t i = 0; i < 10; i++) {
            affine_element P = affine_element(element::random_element());
            uint256_t compressed = uint256_t(P.x);
            if (uint256_t(P.y).get_bit(0)) {
                compressed.data[3] |= group_elements::UINT256_TOP_LIMB_MSB;
            }
            affine_element Q = affine_element::from_compressed(compressed);
            EXPECT_EQ(P, Q);
        }
    }

    static void test_point_compression_unsafe()
    {
        for (size_t i = 0; i < 100; i++) {
            affine_element P = affine_element(element::random_element());
            uint256_t compressed = uint256_t(P.x);

            // Note that we do not check the point Q_points[1] because its highly unlikely to hit a point P on the curve
            // such that r < P.x < q.
            std::array<affine_element, 2> Q_points = affine_element::from_compressed_unsafe(compressed);
            EXPECT_EQ(P, Q_points[0]);
        }
    }

    static void test_add_affine()
    {
        element lhs = element::random_element();
        affine_element lhs_affine(lhs);

        element rhs = element::random_element();
        affine_element rhs_affine(rhs);

        element expected = lhs + rhs;
        affine_element result = lhs_affine + rhs_affine;
        EXPECT_EQ(element(result) == expected, true);
    }

    // Regression test to ensure that the point at infinity is not equal to its coordinate-wise reduction, which may lie
    // on the curve, depending on the y-coordinate.
    static void test_infinity_regression()
    {
        affine_element P;
        P.self_set_infinity();
        affine_element R(0, P.y);
        ASSERT_FALSE(P == R);
    }
    static void test_infinity_ordering_regression()
    {
        affine_element P(0, 1);
        affine_element Q(0, 1);

        P.self_set_infinity();
        EXPECT_NE(P < Q, Q < P);
    }

    // Verify that from_compressed with an x that has no y on the curve returns the (0,0) sentinel.
    static void test_point_compression_invalid_x()
    {
        using Fq = typename G1::Fq;
        size_t invalid_count = 0;
        for (size_t i = 0; i < 20; ++i) {
            affine_element result = affine_element::from_compressed(uint256_t(Fq::random_element()));
            if (!result.on_curve()) {
                ++invalid_count;
                // from_compressed returns (0, 0) when x has no valid y
                EXPECT_EQ(result.x, Fq::zero());
                EXPECT_EQ(result.y, Fq::zero());
            }
        }
        // With 20 trials ~10 should have no valid y, so we almost certainly exercise this path
        EXPECT_GT(invalid_count, 0U);
    }

    /**
     * @brief A regression test to make sure the -1 case is covered
     *
     */
    static void test_batch_endomorphism_by_minus_one()
    {
        constexpr size_t num_points = 2;
        std::vector<affine_element> affine_points(num_points, affine_element::one());

        std::vector<affine_element> result =
            element::batch_mul_with_endomorphism(affine_points, -affine_element::Fr::one());

        for (size_t i = 0; i < num_points; i++) {
            EXPECT_EQ(affine_points[i], -result[i]);
        }
    }

    /**
     * @brief Ensure that the point at inifinity has a fixed value.
     *
     */
    static void test_fixed_point_at_infinity()
    {
        using Fq = affine_element::Fq;
        affine_element P = affine_element::infinity();
        affine_element Q(Fq::zero(), Fq::zero());
        Q.x.self_set_msb();
        affine_element R = affine_element(element::random_element());
        EXPECT_EQ(P, Q);
        EXPECT_NE(P, R);
    }

    static void test_infinity_mul_by_scalar_is_infinity()
    {
        auto result = affine_element::infinity() * Fr::random_element();
        EXPECT_TRUE(result.is_point_at_infinity());
    }

    static void test_batch_mul_matches_non_batch_mul()
    {
        constexpr size_t num_points = 512;
        std::vector<affine_element> affine_points(num_points - 1, affine_element::infinity());
        affine_points.push_back(affine_element::infinity());
        Fr exponent = Fr::random_element();
        std::vector<affine_element> expected;
        std::transform(affine_points.begin(),
                       affine_points.end(),
                       std::back_inserter(expected),
                       [exponent](const auto& el) { return el * exponent; });
        std::vector<affine_element> result = element::batch_mul_with_endomorphism(affine_points, exponent);
        EXPECT_THAT(result, ElementsAreArray(expected));
    }

    static void test_infinity_batch_mul_by_scalar_is_infinity()
    {
        constexpr size_t num_points = 1024;
        std::vector<affine_element> affine_points(num_points, affine_element::infinity());
        std::vector<affine_element> result = element::batch_mul_with_endomorphism(affine_points, Fr::random_element());
        EXPECT_THAT(result, Each(Property(&affine_element::is_point_at_infinity, Eq(true))));
    }

    static void test_batch_mul_endomorphism_even_scalars()
    {
        const affine_element P = affine_element::one();
        const std::vector<affine_element> points(4, P);
        for (const Fr scalar : { Fr(0), Fr(2), Fr(4), Fr(6) }) {
            const auto result = element::batch_mul_with_endomorphism(points, scalar);
            const affine_element expected(element(P) * scalar);
            for (size_t i = 0; i < points.size(); ++i) {
                EXPECT_EQ(result[i], expected);
            }
        }
    }

    static void test_frc_codec_round_trip()
    {
        using FrField = FrCodec::DataType;
        affine_element point = affine_element::random_element();
        std::vector<FrField> public_inputs = FrCodec::serialize_to_fields(point);
        std::span<FrField, affine_element::PUBLIC_INPUTS_SIZE> limbs(public_inputs.data(),
                                                                     affine_element::PUBLIC_INPUTS_SIZE);
        auto reconstructed = FrCodec::deserialize_from_fields<affine_element>(limbs);
        EXPECT_EQ(reconstructed, point);
    }
};

// using TestTypes = testing::Types<bb::g1>;
using TestTypes = testing::Types<bb::g1, grumpkin::g1, secp256k1::g1, secp256r1::g1>;
} // namespace

TYPED_TEST_SUITE(TestAffineElement, TestTypes);

TYPED_TEST(TestAffineElement, AddAffine)
{
    TestFixture::test_add_affine();
}

TYPED_TEST(TestAffineElement, ReadWrite)
{
    TestFixture::test_read_and_write();
}

TYPED_TEST(TestAffineElement, ReadWriteBuffer)
{
    TestFixture::test_read_write_buffer();
    TestFixture::test_msgpack_serialization();
}

TYPED_TEST(TestAffineElement, PointCompression)
{
    if constexpr (TypeParam::Fq::modulus.data[3] >= MODULUS_TOP_LIMB_LARGE_THRESHOLD) {
        GTEST_SKIP();
    } else {
        TestFixture::test_point_compression();
    }
}

TYPED_TEST(TestAffineElement, FixedInfinityPoint)
{
    if constexpr (TypeParam::Fq::modulus.data[3] >= MODULUS_TOP_LIMB_LARGE_THRESHOLD) {
        GTEST_SKIP();
    } else {
        TestFixture::test_fixed_point_at_infinity();
    }
}

TYPED_TEST(TestAffineElement, PointCompressionUnsafe)
{
    if constexpr (TypeParam::Fq::modulus.data[3] >= MODULUS_TOP_LIMB_LARGE_THRESHOLD) {
        TestFixture::test_point_compression_unsafe();
    } else {
        GTEST_SKIP();
    }
}

TYPED_TEST(TestAffineElement, InfinityOrderingRegression)
{
    TestFixture::test_infinity_ordering_regression();
}

namespace bb::group_elements {
// mul_with_endomorphism and mul_without_endomorphism are private in affine_element.
// We could make those public to test or create other public utilities, but to keep the API intact we
// instead mark TestElementPrivate as a friend class so that our test functions can have access.
class TestElementPrivate {
  public:
    template <typename Element, typename Scalar>
    static Element mul_without_endomorphism(const Element& element, const Scalar& scalar)
    {
        return element.mul_without_endomorphism(scalar);
    }
    template <typename Element, typename Scalar>
    static Element mul_with_endomorphism(const Element& element, const Scalar& scalar)
    {
        return element.mul_with_endomorphism(scalar);
    }
};
} // namespace bb::group_elements

// Our endomorphism-specialized multiplication should match our generic multiplication.
// Previously only tested on Grumpkin; now runs on every curve that has USE_ENDOMORPHISM.
TYPED_TEST(TestAffineElement, MulWithEndomorphismMatchesMulWithoutEndomorphism)
{
    if constexpr (!TypeParam::USE_ENDOMORPHISM) {
        GTEST_SKIP();
    } else {
        using element_t = typename TypeParam::element;
        using Fr = typename TypeParam::Fr;
        for (int i = 0; i < 100; i++) {
            element_t x1(element_t::random_element());
            Fr f1 = Fr::random_element();
            element_t r1 = bb::group_elements::TestElementPrivate::mul_without_endomorphism(x1, f1);
            element_t r2 = bb::group_elements::TestElementPrivate::mul_with_endomorphism(x1, f1);
            EXPECT_EQ(r1, r2);
        }
    }
}

// FrCodec is defined only for BN254 and Grumpkin (the two curves whose points appear in transcripts).
TYPED_TEST(TestAffineElement, FrCodecRoundTrip)
{
    if constexpr (std::is_same_v<TypeParam, bb::g1> || std::is_same_v<TypeParam, grumpkin::g1>) {
        TestFixture::test_frc_codec_round_trip();
    } else {
        GTEST_SKIP();
    }
}

// Verify that batch_mul_with_endomorphism gives correct results for even scalars (where k1 or k2 in the
// GLV decomposition is even), exercising the skew-correction path that uses affine_element::operator+.
// Scalar 0 gives k1 = k2 = 0 (both skews), and even scalars like 2 and 4 trigger the k1-skew path.
// These are regression tests for the operator+ fix: reverting to add_chunked would abort when the
// accumulated result happens to equal ±P during the skew correction.
TYPED_TEST(TestAffineElement, BatchMulEndomorphismEvenScalars)
{
    if constexpr (!TypeParam::USE_ENDOMORPHISM) {
        GTEST_SKIP();
    } else {
        TestFixture::test_batch_mul_endomorphism_even_scalars();
    }
}

// Multiplication of a point at infinity by a scalar should be a point at infinity
TYPED_TEST(TestAffineElement, InfinityMulByScalarIsInfinity)
{
    TestFixture::test_infinity_mul_by_scalar_is_infinity();
}

// Batched multiplication of points should match non-batched multiplication
TYPED_TEST(TestAffineElement, BatchMulMatchesNonBatchMul)
{
    if constexpr (!TypeParam::USE_ENDOMORPHISM) {
        GTEST_SKIP();
    } else {
        TestFixture::test_batch_mul_matches_non_batch_mul();
    }
}

// Batched multiplication of a point at infinity by a scalar should result in points at infinity
TYPED_TEST(TestAffineElement, InfinityBatchMulByScalarIsInfinity)
{
    if constexpr (!TypeParam::USE_ENDOMORPHISM) {
        GTEST_SKIP();
    } else {
        TestFixture::test_infinity_batch_mul_by_scalar_is_infinity();
    }
}

TYPED_TEST(TestAffineElement, BatchEndomoprhismByMinusOne)
{
    if constexpr (TypeParam::USE_ENDOMORPHISM) {
        TestFixture::test_batch_endomorphism_by_minus_one();
    } else {
        GTEST_SKIP();
    }
}

// Verify that serialize_from_buffer rejects off-curve bytes by throwing (tests the invalid-curve attack fix).
TYPED_TEST(TestAffineElement, DeserializeOffCurveThrows)
{
    TestFixture::test_deserialize_off_curve_throws();
}

// Verify that from_compressed returns the (0,0) sentinel for x values with no valid y.
TYPED_TEST(TestAffineElement, PointCompressionInvalidX)
{
    if constexpr (TypeParam::Fq::modulus.data[3] >= MODULUS_TOP_LIMB_LARGE_THRESHOLD) {
        GTEST_SKIP(); // from_compressed is not used on large-modulus curves
    } else {
        TestFixture::test_point_compression_invalid_x();
    }
}

TEST(AffineElement, HashToCurve)
{
    std::vector<std::tuple<std::vector<uint8_t>, grumpkin::g1::affine_element>> test_vectors;
    test_vectors.emplace_back(std::vector<uint8_t>(),
                              grumpkin::g1::affine_element(
                                  fr(uint256_t("24c4cb9c1206ab5470592f237f1698abe684dadf0ab4d7a132c32b2134e2c12e")),
                                  fr(uint256_t("0668b8d61a317fb34ccad55c930b3554f1828a0e5530479ecab4defe6bbc0b2e"))));

    test_vectors.emplace_back(std::vector<uint8_t>{ 1 },
                              grumpkin::g1::affine_element(
                                  fr(uint256_t("107f1b633c6113f3222f39f6256f0546b41a4880918c86864b06471afb410454")),
                                  fr(uint256_t("050cd3823d0c01590b6a50adcc85d2ee4098668fd28805578aa05a423ea938c6"))));

    // "hello world"
    test_vectors.emplace_back(std::vector<uint8_t>{ 0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x77, 0x6f, 0x72, 0x6c, 0x64 },
                              grumpkin::g1::affine_element(
                                  fr(uint256_t("037c5c229ae495f6e8d1b4bf7723fafb2b198b51e27602feb8a4d1053d685093")),
                                  fr(uint256_t("10cf9596c5b2515692d930efa2cf3817607e4796856a79f6af40c949b066969f"))));

    for (std::tuple<std::vector<uint8_t>, grumpkin::g1::affine_element> test_case : test_vectors) {
        auto result = grumpkin::g1::affine_element::hash_to_curve(std::get<0>(test_case), 0);
        auto expected_result = std::get<1>(test_case);
        std::cout << result << std::endl;
        EXPECT_TRUE(result == expected_result);
    }
}
