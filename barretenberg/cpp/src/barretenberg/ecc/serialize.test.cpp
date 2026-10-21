#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/fields/field.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/serialize/test_helper.hpp"
#include <gtest/gtest.h>

TEST(MsgpackTests, MsgpackField)
{
    auto [actual, expected] = msgpack_roundtrip(bb::fr{ 1ULL, 2ULL, 3ULL, 4ULL });
    EXPECT_EQ(actual, expected);
}

TEST(Serialization, RejectsNoncanonicalFieldBytes)
{
    using FF = bb::fr;
    const auto max_canonical = to_buffer(FF::modulus - 1);
    EXPECT_EQ(from_buffer<FF>(max_canonical), -FF(1));
    ASSERT_THROW_OR_ABORT(from_buffer<FF>(to_buffer(FF::modulus)), "Non-canonical field element");
    ASSERT_THROW_OR_ABORT(from_buffer<FF>(to_buffer(FF::modulus + 1)), "Non-canonical field element");
}

TEST(Serialization, ReducesFieldBytes)
{
    using FF = bb::fr;
    EXPECT_EQ(FF::from_bytes_reduced(to_buffer(FF::modulus)), FF(0));
    EXPECT_EQ(FF::from_bytes_reduced(to_buffer(FF::modulus + 1)), FF(1));

    const std::array<uint8_t, 31> short_bytes{};
    ASSERT_THROW_OR_ABORT(FF::from_bytes_reduced(short_bytes), "Field element input must be 32 bytes");
}

TEST(Serialization, AffineCoordinatesAreCanonical)
{
    const auto one = bb::g1::affine_one;
    EXPECT_EQ(from_buffer<bb::g1::affine_element>(to_buffer(one)), one);
    auto bytes = to_buffer(one);
    const auto aliased_x = to_buffer(bb::fq::modulus + 1);
    std::copy(aliased_x.begin(), aliased_x.end(), bytes.begin());
    ASSERT_THROW_OR_ABORT(from_buffer<bb::g1::affine_element>(bytes), "Non-canonical field element");
    const auto infinity = bb::g1::affine_element::infinity();
    EXPECT_TRUE(from_buffer<bb::g1::affine_element>(to_buffer(infinity)).is_point_at_infinity());
}
