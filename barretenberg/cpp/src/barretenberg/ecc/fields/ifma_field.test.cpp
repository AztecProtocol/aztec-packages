#include "barretenberg/ecc/fields/ifma_field.hpp"
#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <algorithm>
#include <array>
#include <gtest/gtest.h>

#ifdef BB_FIELD_IFMA
namespace {
template <typename F, size_t N> void check_products()
{
    using bb::numeric::uint256_t;
    constexpr uint64_t sentinel = 0xcafe12345678abcdULL;
    const auto p = F::modulus;
    const std::array<uint256_t, 6> edges{ 0, 1, p - 1, p, p + 1, p + p - 1 };
    for (size_t round = 0; round < 128; ++round) {
        std::array<F, N> a, b;
        std::array<uint64_t, 4 * N + 2> storage_a, storage_b;
        storage_a.front() = storage_a.back() = sentinel;
        storage_b.front() = storage_b.back() = sentinel;
        for (size_t i = 0; i < N; ++i) {
            const auto x = round < 36 ? edges[(round + i) % edges.size()] : uint256_t(F::random_element());
            const auto y = round < 36 ? edges[(round / 6 + i) % edges.size()] : uint256_t(F::random_element());
            a[i] = F{ x.data[0], x.data[1], x.data[2], x.data[3] };
            b[i] = F{ y.data[0], y.data[1], y.data[2], y.data[3] };
            std::copy_n(a[i].data, 4, storage_a.data() + 1 + 4 * i);
            std::copy_n(b[i].data, 4, storage_b.data() + 1 + 4 * i);
        }
        const auto original = storage_a;
        auto check = [&](const auto& expected) {
            for (size_t i = 0; i < N; ++i) {
                const auto* limbs = storage_a.data() + 1 + 4 * i;
                const F got{ limbs[0], limbs[1], limbs[2], limbs[3] };
                EXPECT_EQ(got, expected(i));
                EXPECT_LT(uint256_t(limbs[0], limbs[1], limbs[2], limbs[3]), p + p);
            }
            EXPECT_EQ(storage_a.front(), sentinel);
            EXPECT_EQ(storage_a.back(), sentinel);
        };
        bb::field_ifma::mul_assign_n<typename F::Params, N>(storage_a.data() + 1, storage_b.data() + 1);
        check([&](size_t i) { return a[i].montgomery_mul(b[i]); });
        storage_a = original;
        bb::field_ifma::sqr_assign_n<typename F::Params, N>(storage_a.data() + 1);
        check([&](size_t i) { return a[i].montgomery_square(); });
        storage_a = original;
        bb::field_ifma::mul_assign_n<typename F::Params, N>(storage_a.data() + 1, storage_a.data() + 1);
        check([&](size_t i) { return a[i].montgomery_square(); });
        storage_a = original;
        bb::field_ifma::mul_assign_scalar_n<typename F::Params, N>(storage_a.data() + 1, storage_b.data() + 1);
        check([&](size_t i) { return a[i].montgomery_mul(b[0]); });
    }
}

template <typename F> class IfmaFieldTest : public testing::Test {};
using Fields = testing::Types<bb::fr, bb::fq>;
TYPED_TEST_SUITE(IfmaFieldTest, Fields);
TYPED_TEST(IfmaFieldTest, ProductsMatchPortableArithmetic)
{
    if (!bb::field_ifma::available()) {
        GTEST_SKIP() << "AVX-512 IFMA is unavailable";
    }
    check_products<TypeParam, 1>();
    check_products<TypeParam, 2>();
    check_products<TypeParam, 3>();
    check_products<TypeParam, 4>();
    check_products<TypeParam, 5>();
    check_products<TypeParam, 6>();
    check_products<TypeParam, 7>();
    check_products<TypeParam, 8>();
}
} // namespace
#endif
