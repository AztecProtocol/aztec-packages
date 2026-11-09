#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/secp256k1/secp256k1.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include <gtest/gtest.h>

namespace {
template <typename F, size_t N> void check_univariate()
{
    using bb::numeric::uint256_t;
    constexpr auto p = F::modulus;
    for (size_t round = 0; round < 64; ++round) {
        bb::Univariate<F, N> a, b;
        for (size_t i = 0; i < N; ++i) {
            if constexpr (p.data[3] < 0x4000000000000000ULL) {
                const std::array<uint256_t, 6> edges{ 0, 1, p - 1, p, p + 1, p + p - 1 };
                const auto x = edges[(round + i) % edges.size()];
                a.evaluations[i] = round < 6 ? F{ x.data[0], x.data[1], x.data[2], x.data[3] } : F::random_element();
            } else {
                a.evaluations[i] = F::random_element();
            }
            b.evaluations[i] = F::random_element();
        }
        auto product = a;
        product *= b;
        auto square = a;
        square.self_sqr();
        auto alias = a;
        alias *= alias;
        const auto scalar = F::random_element();
        auto scaled = a;
        scaled *= scalar;
        for (size_t i = 0; i < N; ++i) {
            EXPECT_EQ(product.evaluations[i], a.evaluations[i].montgomery_mul(b.evaluations[i]));
            EXPECT_EQ(square.evaluations[i], a.evaluations[i].montgomery_square());
            EXPECT_EQ(alias.evaluations[i], a.evaluations[i].montgomery_square());
            EXPECT_EQ(scaled.evaluations[i], a.evaluations[i].montgomery_mul(scalar));
        }
    }
}
template <typename F> class UnivariateArithmeticTest : public testing::Test {};
using Fields = testing::Types<bb::fr, bb::fq, bb::secp256k1::fr>;
TYPED_TEST_SUITE(UnivariateArithmeticTest, Fields);
TYPED_TEST(UnivariateArithmeticTest, ProductsMatchPortableArithmetic)
{
    check_univariate<TypeParam, 1>();
    check_univariate<TypeParam, 3>();
    check_univariate<TypeParam, 4>();
    check_univariate<TypeParam, 5>();
    check_univariate<TypeParam, 6>();
    check_univariate<TypeParam, 7>();
    check_univariate<TypeParam, 8>();
    check_univariate<TypeParam, 9>();
}
} // namespace
