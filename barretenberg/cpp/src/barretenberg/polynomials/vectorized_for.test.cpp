#include "barretenberg/ecc/fields/vectorized_for.hpp"

#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/fields/vector_field.hpp"
#include "barretenberg/polynomials/polynomial.hpp"

#include <gtest/gtest.h>
#include <vector>

namespace {

using bb::ContiguousVectorIndex;
using bb::ScalarIndex;
using bb::shift;
using bb::VECTOR_FIELD_WIDTH;
using bb::VectorIndex;
using bb::vectorized_for;
using bb::vectorized_for_if;
using Fr = bb::fr;
using Vec = bb::VectorField<bb::Bn254FrParams>;
using Poly = bb::Polynomial<Fr>;

TEST(VectorizedForTest, ScalarIndexShift)
{
    EXPECT_EQ(shift(ScalarIndex{ 7 }, 3).i, 10u);
}

TEST(VectorizedForTest, VectorIndexShift)
{
    auto out = shift(VectorIndex<5>{ { 0, 1, 2, 3, 4 } }, 10);
    std::array<size_t, 5> expected{ 10, 11, 12, 13, 14 };
    for (size_t k = 0; k < 5; ++k) {
        EXPECT_EQ(out.idx[k], expected[k]) << "lane " << k;
    }
}

TEST(VectorizedForTest, ConstexprShift)
{
    static_assert(shift(ScalarIndex{ 1 }, 2).i == 3);
    static_assert(shift(VectorIndex<3>{ { 1, 2, 3 } }, 5).idx[2] == 8);
    SUCCEED();
}

TEST(VectorizedFor, ContiguousVectorIndexShift)
{
    EXPECT_EQ(shift(ContiguousVectorIndex<5>{ 7 }, 3).base, 10u);
}

TEST(VectorizedForTest, PolynomialScalarReadWrite)
{
    Poly p(8);
    std::array<Fr, 8> known;
    for (size_t i = 0; i < 8; ++i) {
        known[i] = Fr::random_element();
        p.at(i) = known[i];
    }

    // Read via ScalarIndex on a mutable Polynomial: the proxy implicitly
    // converts to Fr.
    Fr r = p[ScalarIndex{ 3 }];
    EXPECT_EQ(r, known[3]);

    // Write via ScalarIndex.
    Fr v = Fr(42);
    p[ScalarIndex{ 5 }] = v;
    EXPECT_EQ(p[5], v);
}

TEST(VectorizedForTest, PolynomialVectorReadRoundTrip)
{
    Poly p(16);
    for (size_t i = 0; i < 16; ++i) {
        p.at(i) = Fr::random_element();
    }

    std::array<size_t, 5> idx{ 3, 0, 7, 15, 9 };
    // Read via VectorIndex on a mutable Polynomial: the proxy implicitly
    // converts to VectorField.
    Vec v = p[VectorIndex<5>{ idx }];
    for (size_t L = 0; L < 5; ++L) {
        EXPECT_EQ(v.get(L), p[idx[L]]) << "lane " << L;
    }
}

TEST(VectorizedForTest, PolynomialVectorWrite)
{
    Poly p(16); // Zero-initialized by the (size_t) ctor.

    std::array<Fr, 5> vals{
        Fr::random_element(), Fr::random_element(), Fr::random_element(), Fr::random_element(), Fr::random_element()
    };
    Vec v(vals);

    std::array<size_t, 5> idx{ 2, 5, 1, 8, 0 };
    p[VectorIndex<5>{ idx }] = v;

    // Target positions match.
    for (size_t L = 0; L < 5; ++L) {
        EXPECT_EQ(p[idx[L]], vals[L]) << "lane " << L;
    }

    // Untouched positions remain zero.
    for (size_t i = 0; i < 16; ++i) {
        bool is_target = false;
        for (size_t L = 0; L < 5; ++L) {
            if (idx[L] == i) {
                is_target = true;
                break;
            }
        }
        if (!is_target) {
            EXPECT_TRUE(p[i].is_zero()) << "position " << i;
        }
    }
}

TEST(VectorizedForTest, VectorizedForPointwiseMulExact)
{
    constexpr size_t SIZE = 20;
    Poly a(SIZE), b(SIZE), out(SIZE);
    for (size_t i = 0; i < SIZE; ++i) {
        a.at(i) = Fr(i * 7 + 3);
        b.at(i) = Fr(i * 11 + 5);
    }

    vectorized_for<VECTOR_FIELD_WIDTH, Fr>(0, SIZE, [&](auto ctx) { out[ctx] = a[ctx] * b[ctx]; });

    for (size_t i = 0; i < SIZE; ++i) {
        Fr ref = a[i] * b[i];
        EXPECT_EQ(out[i], ref) << "i=" << i;
    }
}

TEST(VectorizedForTest, VectorizedForTailExercised)
{
    constexpr size_t SIZE = 23;
    Poly a(SIZE), b(SIZE), out(SIZE);
    for (size_t i = 0; i < SIZE; ++i) {
        a.at(i) = Fr(i * 7 + 3);
        b.at(i) = Fr(i * 11 + 5);
    }

    vectorized_for<VECTOR_FIELD_WIDTH, Fr>(0, SIZE, [&](auto ctx) { out[ctx] = a[ctx] * b[ctx]; });

    for (size_t i = 0; i < SIZE; ++i) {
        Fr ref = a[i] * b[i];
        EXPECT_EQ(out[i], ref) << "i=" << i;
    }
}

TEST(VectorizedForTest, VectorizedForNonZeroStart)
{
    constexpr size_t SIZE = 16;
    Poly a(SIZE), out(SIZE); // out zero-initialized.
    for (size_t i = 0; i < SIZE; ++i) {
        a.at(i) = Fr(i * 13 + 1);
    }

    vectorized_for<VECTOR_FIELD_WIDTH, Fr>(3, 14, [&](auto ctx) { out[ctx] = a[ctx] + a[ctx]; });

    for (size_t i = 0; i < 3; ++i) {
        EXPECT_TRUE(out[i].is_zero()) << "i=" << i;
    }
    for (size_t i = 3; i < 14; ++i) {
        Fr ref = a[i] + a[i];
        EXPECT_EQ(out[i], ref) << "i=" << i;
    }
    for (size_t i = 14; i < SIZE; ++i) {
        EXPECT_TRUE(out[i].is_zero()) << "i=" << i;
    }
}

TEST(VectorizedForTest, VectorizedForEmptyRange)
{
    size_t counter = 0;
    vectorized_for<VECTOR_FIELD_WIDTH, Fr>(5, 5, [&](auto) { ++counter; });
    EXPECT_EQ(counter, 0u);

    counter = 0;
    vectorized_for<VECTOR_FIELD_WIDTH, Fr>(5, 7, [&](auto) { ++counter; });
    EXPECT_EQ(counter, 2u);
}

TEST(VectorizedForTest, VectorizedForSelfReadMutable)
{
    constexpr size_t SIZE = 20;
    Poly p(SIZE);
    std::array<Fr, SIZE> original;
    for (size_t i = 0; i < SIZE; ++i) {
        original[i] = Fr(i * 7 + 3);
        p.at(i) = original[i];
    }

    vectorized_for<VECTOR_FIELD_WIDTH, Fr>(0, SIZE, [&](auto ctx) { p[ctx] = p[ctx] + p[ctx]; });

    for (size_t i = 0; i < SIZE; ++i) {
        Fr ref = original[i] + original[i];
        EXPECT_EQ(p[i], ref) << "i=" << i;
    }
}

TEST(VectorizedForTest, VectorizedForSelfReadMutableTail)
{
    constexpr size_t SIZE = 23;
    Poly p(SIZE);
    std::array<Fr, SIZE> original;
    for (size_t i = 0; i < SIZE; ++i) {
        original[i] = Fr(i * 7 + 3);
        p.at(i) = original[i];
    }

    vectorized_for<VECTOR_FIELD_WIDTH, Fr>(0, SIZE, [&](auto ctx) { p[ctx] = p[ctx] + p[ctx]; });

    for (size_t i = 0; i < SIZE; ++i) {
        Fr ref = original[i] + original[i];
        EXPECT_EQ(p[i], ref) << "i=" << i;
    }
}

TEST(VectorizedForTest, MixedKernelSelfPlusOther)
{
    constexpr size_t SIZE = 20;
    Poly self(SIZE), other(SIZE);
    std::array<Fr, SIZE> self_orig, other_vals;
    for (size_t i = 0; i < SIZE; ++i) {
        self_orig[i] = Fr(i * 13 + 1);
        other_vals[i] = Fr(i * 17 + 2);
        self.at(i) = self_orig[i];
        other.at(i) = other_vals[i];
    }
    Fr scalar = Fr(7);

    vectorized_for<VECTOR_FIELD_WIDTH, Fr>(0, SIZE, [&](auto ctx) { self[ctx] = self[ctx] + other[ctx] * scalar; });

    for (size_t i = 0; i < SIZE; ++i) {
        Fr ref = self_orig[i] + other_vals[i] * scalar;
        EXPECT_EQ(self[i], ref) << "i=" << i;
    }
}

TEST(VectorizedForTest, VectorizedForIfEvenIndices)
{
    constexpr size_t SIZE = 32;
    Poly p(SIZE);
    for (size_t i = 0; i < SIZE; ++i) {
        p.at(i) = Fr(i);
    }

    vectorized_for_if<VECTOR_FIELD_WIDTH, Fr>(
        0, SIZE, [](size_t i) { return (i % 2) == 0; }, [&](auto ctx) { p[ctx] = p[ctx] + p[ctx]; });

    for (size_t i = 0; i < SIZE; ++i) {
        if (i % 2 == 0) {
            EXPECT_EQ(p[i], Fr(2 * i)) << "i=" << i;
        } else {
            EXPECT_EQ(p[i], Fr(i)) << "i=" << i;
        }
    }
}

TEST(VectorizedForTest, VectorizedForIfAllMatch)
{
    constexpr size_t SIZE = 25;
    Poly p(SIZE);
    std::array<Fr, SIZE> original;
    for (size_t i = 0; i < SIZE; ++i) {
        original[i] = Fr(i * 3 + 1);
        p.at(i) = original[i];
    }

    vectorized_for_if<VECTOR_FIELD_WIDTH, Fr>(
        0, SIZE, [](size_t) { return true; }, [&](auto ctx) { p[ctx] = p[ctx] + p[ctx]; });

    for (size_t i = 0; i < SIZE; ++i) {
        EXPECT_EQ(p[i], original[i] + original[i]) << "i=" << i;
    }
}

TEST(VectorizedForTest, VectorizedForIfNoneMatch)
{
    size_t counter = 0;
    vectorized_for_if<VECTOR_FIELD_WIDTH, Fr>(0, 20, [](size_t) { return false; }, [&](auto) { ++counter; });
    EXPECT_EQ(counter, 0u);
}

TEST(VectorizedForTest, VectorizedForIfTailOnly)
{
    constexpr size_t SIZE = 10;
    Poly p(SIZE);
    std::array<Fr, SIZE> original;
    for (size_t i = 0; i < SIZE; ++i) {
        original[i] = Fr(i * 11 + 7);
        p.at(i) = original[i];
    }

    auto pred = [](size_t i) { return i == 1 || i == 4 || i == 7; };
    size_t kernel_calls = 0;
    vectorized_for_if<VECTOR_FIELD_WIDTH, Fr>(0, SIZE, pred, [&](auto ctx) {
        ++kernel_calls;
        p[ctx] = p[ctx] + p[ctx];
    });

    EXPECT_EQ(kernel_calls, 3u);
    for (size_t i = 0; i < SIZE; ++i) {
        if (pred(i)) {
            EXPECT_EQ(p[i], original[i] + original[i]) << "i=" << i;
        } else {
            EXPECT_EQ(p[i], original[i]) << "i=" << i;
        }
    }
}

TEST(VectorizedForTest, VectorizedForIfPredicateCallOrder)
{
    std::vector<size_t> log;
    vectorized_for_if<VECTOR_FIELD_WIDTH, Fr>(
        5,
        17,
        [&](size_t i) {
            log.push_back(i);
            return false;
        },
        [&](auto) { /* never invoked */ });

    std::vector<size_t> expected{ 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16 };
    EXPECT_EQ(log, expected);
}

} // namespace
