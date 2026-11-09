#include "barretenberg/ecc/scalar_multiplication/batch_affine_ifma.hpp"

#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"

#include <array>
#include <gtest/gtest.h>
#include <memory>
#include <vector>

#ifdef BB_MSM_IFMA
namespace {

template <typename Curve> void check_drain(size_t n)
{
    using Affine = typename Curve::AffineElement;
    using F = typename Curve::BaseField;
    auto buffer = std::make_unique<bb::scalar_multiplication::ifma::DrainBuffer<256>>();
    std::vector<Affine> expected(n), actual(n);
    for (size_t i = 0; i < n; ++i) {
        const auto left = Affine::random_element();
        auto right = Affine::random_element();
        while (left.x == right.x) {
            right = Affine::random_element();
        }
        buffer->push(i, left.x, left.y, right.x, right.y);
        buffer->pair_dest[i] = static_cast<uint32_t>(n - 1 - i);
        expected[n - 1 - i] = Affine(typename Curve::Element(left) + right);
    }
    bb::scalar_multiplication::ifma::drain_to<F>(*buffer, n, actual.data());
    EXPECT_EQ(actual, expected);
    for (const auto& point : actual) {
        EXPECT_TRUE(point.on_curve());
    }
}

template <typename Curve> class IfmaDrainTest : public testing::Test {};
using Curves = testing::Types<bb::curve::BN254, bb::curve::Grumpkin>;
TYPED_TEST_SUITE(IfmaDrainTest, Curves);
TYPED_TEST(IfmaDrainTest, SmallDrainsMatchGroupAddition)
{
    for (size_t n = 0; n <= 6; ++n) {
        check_drain<TypeParam>(n);
    }
}

TYPED_TEST(IfmaDrainTest, VectorDrainsMatchGroupAddition)
{
    if (!bb::scalar_multiplication::ifma::ifma_available()) {
        GTEST_SKIP() << "AVX-512 IFMA is unavailable";
    }
    for (size_t n : std::array<size_t, 11>{ 7, 8, 9, 15, 16, 17, 63, 64, 65, 255, 256 }) {
        check_drain<TypeParam>(n);
    }
}

} // namespace
#endif
