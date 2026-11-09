#include "asm_macros_short_carry.hpp"
#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"

#include <gtest/gtest.h>
#include <vector>

#if (BBERG_NO_ASM == 0) && defined(__ADX__) && !defined(DISABLE_ADX)
namespace {
template <class F> F multiply_short_carry(const F& a, const F& b) noexcept
{
    F r;
    constexpr uint64_t r_inv = F::Params::r_inv;
    constexpr uint64_t modulus_0 = F::modulus.data[0];
    constexpr uint64_t modulus_1 = F::modulus.data[1];
    constexpr uint64_t modulus_2 = F::modulus.data[2];
    constexpr uint64_t modulus_3 = F::modulus.data[3];
    constexpr uint64_t zero_ref = 0;

    __asm__(MUL_SHORT_CARRY("0(%0)", "8(%0)", "16(%0)", "24(%0)", "%1")
                STORE_FIELD_ELEMENT("%2", "%%r12", "%%r13", "%%r14", "%%r15")
            :
            : "%r"(&a),
              "%r"(&b),
              "r"(&r),
              [modulus_0] "m"(modulus_0),
              [modulus_1] "m"(modulus_1),
              [modulus_2] "m"(modulus_2),
              [modulus_3] "m"(modulus_3),
              [r_inv] "m"(r_inv),
              [zero_reference] "m"(zero_ref)
            : "%rdx", "%rdi", "%r8", "%r9", "%r10", "%r11", "%r12", "%r13", "%r14", "%r15", "cc", "memory");
    return r;
}

template <class F> F square_low_half(const F& a) noexcept
{
    F r;
    constexpr uint64_t r_inv = F::Params::r_inv;
    constexpr uint64_t modulus_0 = F::modulus.data[0];
    constexpr uint64_t modulus_1 = F::modulus.data[1];
    constexpr uint64_t modulus_2 = F::modulus.data[2];
    constexpr uint64_t modulus_3 = F::modulus.data[3];
    constexpr uint64_t zero_ref = 0;

#if !defined(__ADX__) || defined(DISABLE_ADX)

    __asm__(MUL_SHORT_CARRY("0(%0)", "8(%0)", "16(%0)", "24(%0)", "%1")
                STORE_FIELD_ELEMENT("%2", "%%r12", "%%r13", "%%r14", "%%r15")
            :
            : "%r"(&a),
              "%r"(&a),
              "r"(&r),
              [modulus_0] "m"(modulus_0),
              [modulus_1] "m"(modulus_1),
              [modulus_2] "m"(modulus_2),
              [modulus_3] "m"(modulus_3),
              [r_inv] "m"(r_inv),
              [zero_reference] "m"(zero_ref)
            : "%rdx", "%rdi", "%r8", "%r9", "%r10", "%r11", "%r12", "%r13", "%r14", "%r15", "cc", "memory");

#else

    __asm__(SQR_LOW_HALF_REDUCTION("%0")

                STORE_FIELD_ELEMENT("%1", "%%r12", "%%r13", "%%r14", "%%r15")
            :
            : "r"(&a),
              "r"(&r),
              [zero_reference] "m"(zero_ref),
              [modulus_0] "m"(modulus_0),
              [modulus_1] "m"(modulus_1),
              [modulus_2] "m"(modulus_2),
              [modulus_3] "m"(modulus_3),
              [r_inv] "m"(r_inv)
            : "%rcx", "%rdx", "%rdi", "%r8", "%r9", "%r10", "%r11", "%r12", "%r13", "%r14", "%r15", "cc", "memory");
#endif
    return r;
}

template <class F> class AdxArithmeticTests : public ::testing::Test {};
using Fields = ::testing::Types<bb::fr, bb::fq>;
TYPED_TEST_SUITE(AdxArithmeticTests, Fields);

TYPED_TEST(AdxArithmeticTests, CoarseInputsMatchPortableArithmetic)
{
    using F = TypeParam;
    using bb::numeric::uint256_t;
    const auto p = F::modulus;
    std::vector<uint256_t> inputs{ 0, 1, p - 1, p, p + 1, (p + p) - 1 };
    for (size_t bit = 0; bit < 254; ++bit) {
        inputs.push_back(uint256_t(1) << bit);
    }
    for (const auto& a : inputs) {
        F x{ a.data[0], a.data[1], a.data[2], a.data[3] };
        const F square = square_low_half(x);
        EXPECT_EQ(square, x.montgomery_square());
        EXPECT_LT(uint256_t(square.data[0], square.data[1], square.data[2], square.data[3]), p + p);
        for (const auto& b : inputs) {
            F y{ b.data[0], b.data[1], b.data[2], b.data[3] };
            const F product = multiply_short_carry(x, y);
            EXPECT_EQ(product, x.montgomery_mul(y));
            EXPECT_LT(uint256_t(product.data[0], product.data[1], product.data[2], product.data[3]), p + p);
        }
    }
}

TYPED_TEST(AdxArithmeticTests, RandomInputsMatchPortableArithmetic)
{
    using F = TypeParam;
    for (size_t i = 0; i < 4096; ++i) {
        const F x = F::random_element();
        const F y = F::random_element();
        EXPECT_EQ(multiply_short_carry(x, y), x.montgomery_mul(y));
        EXPECT_EQ(square_low_half(x), x.montgomery_square());
    }
}

} // namespace
#endif
