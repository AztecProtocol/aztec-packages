#include <cstddef>
#include <gtest/gtest.h>

#include "barretenberg/common/assert.hpp"
#include "barretenberg/polynomials/polynomial.hpp"

// Simple test/demonstration of shifted functionality
TEST(Polynomial, Shifted)
{
    using FF = bb::fr;
    using Polynomial = bb::Polynomial<FF>;
    const size_t SIZE = 10;
    auto poly = Polynomial::random(SIZE, /*shiftable*/ 1);

    // Instantiate the shift via the shited method
    auto poly_shifted = poly.shifted();

    EXPECT_EQ(poly_shifted.size(), poly.size());

    // The shift is indeed the shift
    for (size_t i = 0; i < poly_shifted.size() - 1; ++i) {
        EXPECT_EQ(poly_shifted.get(i), poly.get(i + 1));
    }

    // If I change the original polynomial, the shift is updated accordingly
    poly.at(3) = 25;
    for (size_t i = 0; i < poly_shifted.size() - 1; ++i) {
        EXPECT_EQ(poly_shifted.get(i), poly.get(i + 1));
    }
}

// Simple test/demonstration of reverse functionality
TEST(Polynomial, Reversed)
{
    using FF = bb::fr;
    using Polynomial = bb::Polynomial<FF>;
    const size_t SIZE = 10;
    const size_t VIRTUAL_SIZE = 20;
    const size_t START_IDX = 2;
    const size_t END_IDX = SIZE + START_IDX;
    auto poly = Polynomial::random(SIZE, VIRTUAL_SIZE, START_IDX);

    // Instantiate the shift via the reverse method
    auto poly_reversed = poly.reverse();

    EXPECT_EQ(poly_reversed.size(), poly.size());
    EXPECT_EQ(poly_reversed.virtual_size(), poly.end_index());

    // The reversed is indeed the reversed
    for (size_t i = 0; i < END_IDX; ++i) {
        EXPECT_EQ(poly_reversed.get(END_IDX - 1 - i), poly.get(i));
    }

    // If I change the original polynomial, the reversed polynomial is not updated
    FF initial_value = poly.at(3);
    poly.at(3) = 25;
    EXPECT_EQ(poly_reversed.at(END_IDX - 4), initial_value);
}

// Simple test/demonstration of share functionality
TEST(Polynomial, Share)
{
    using FF = bb::fr;
    using Polynomial = bb::Polynomial<FF>;
    const size_t SIZE = 10;
    auto poly = Polynomial::random(SIZE);

    // "clone" the poly via the share method
    auto poly_clone = poly.share();

    // The two are indeed equal
    EXPECT_EQ(poly_clone, poly);

    // Changing one changes the other
    poly.at(3) = 25;
    EXPECT_EQ(poly_clone, poly);

    poly_clone.at(2) = 13;
    EXPECT_EQ(poly_clone, poly);

    // If reset the original poly, it will no longer be equal to the clone made earlier
    // Note: if we had not made a clone, the memory from the original poly would be leaked
    auto poly2 = Polynomial::random(SIZE);
    poly = poly2.share();

    EXPECT_NE(poly_clone, poly);
}

// Simple test/demonstration of various edge conditions
TEST(Polynomial, Indices)
{
    auto poly = bb::Polynomial<bb::fr>::random(100, /*offset*/ 1);
    EXPECT_TRUE(poly.is_shiftable());
    EXPECT_EQ((*poly.indices().begin()), poly.start_index());
    EXPECT_EQ(std::get<0>(*poly.indexed_values().begin()), poly.start_index());
    EXPECT_EQ(std::get<1>(*poly.indexed_values().begin()), poly[poly.start_index()]);
}

TEST(Polynomial, AddScaledVectorizedMatchesScalar)
{
    using FF = bb::fr;
    using Poly = bb::Polynomial<FF>;

    // self: logical indices [2, 32); other: logical indices [5, 18).
    // Overlap region is other's range [5, 18) — 13 elements, not a multiple
    // of 5 (exercises both the bulk and the tail of vectorized_for).
    constexpr size_t SELF_SIZE = 30;
    constexpr size_t SELF_VSIZE = 32;
    constexpr size_t SELF_START = 2;
    constexpr size_t OTHER_SIZE = 13;
    constexpr size_t OTHER_VSIZE = 32;
    constexpr size_t OTHER_START = 5;

    Poly self(SELF_SIZE, SELF_VSIZE, SELF_START);
    Poly other(OTHER_SIZE, OTHER_VSIZE, OTHER_START);
    for (size_t i = SELF_START; i < SELF_START + SELF_SIZE; ++i) {
        self.at(i) = FF((i * 11) + 1);
    }
    for (size_t i = OTHER_START; i < OTHER_START + OTHER_SIZE; ++i) {
        other.at(i) = FF((i * 17) + 3);
    }
    Poly self_ref = self;
    FF scalar = FF(7);

    self.add_scaled(other, scalar);

    for (size_t i = OTHER_START; i < OTHER_START + OTHER_SIZE; ++i) {
        self_ref.at(i) = self_ref.at(i) + scalar * other.at(i);
    }
    for (size_t i = SELF_START; i < SELF_START + SELF_SIZE; ++i) {
        EXPECT_EQ(self.at(i), self_ref.at(i)) << "i=" << i;
    }
}

// Parity tests for the vectorized operator+=, operator-=, operator*=
// migrations. Each pairs an in-place operation against an iterated scalar
// reference over a span whose length is deliberately not a multiple of
// VECTOR_FIELD_WIDTH=5, so both bulk and tail paths fire.
TEST(Polynomial, AddAssignVectorizedMatchesScalar)
{
    using FF = bb::fr;
    using Poly = bb::Polynomial<FF>;
    constexpr size_t SELF_SIZE = 30;
    constexpr size_t SELF_VSIZE = 32;
    constexpr size_t SELF_START = 2;
    constexpr size_t OTHER_SIZE = 13;
    constexpr size_t OTHER_VSIZE = 32;
    constexpr size_t OTHER_START = 5;

    Poly self(SELF_SIZE, SELF_VSIZE, SELF_START);
    Poly other(OTHER_SIZE, OTHER_VSIZE, OTHER_START);
    for (size_t i = SELF_START; i < SELF_START + SELF_SIZE; ++i) {
        self.at(i) = FF((i * 11) + 1);
    }
    for (size_t i = OTHER_START; i < OTHER_START + OTHER_SIZE; ++i) {
        other.at(i) = FF((i * 17) + 3);
    }
    Poly self_ref = self;

    self += other;

    for (size_t i = OTHER_START; i < OTHER_START + OTHER_SIZE; ++i) {
        self_ref.at(i) = self_ref.at(i) + other.at(i);
    }
    for (size_t i = SELF_START; i < SELF_START + SELF_SIZE; ++i) {
        EXPECT_EQ(self.at(i), self_ref.at(i)) << "i=" << i;
    }
}

TEST(Polynomial, SubtractAssignVectorizedMatchesScalar)
{
    using FF = bb::fr;
    using Poly = bb::Polynomial<FF>;
    constexpr size_t SELF_SIZE = 30;
    constexpr size_t SELF_VSIZE = 32;
    constexpr size_t SELF_START = 2;
    constexpr size_t OTHER_SIZE = 13;
    constexpr size_t OTHER_VSIZE = 32;
    constexpr size_t OTHER_START = 5;

    Poly self(SELF_SIZE, SELF_VSIZE, SELF_START);
    Poly other(OTHER_SIZE, OTHER_VSIZE, OTHER_START);
    for (size_t i = SELF_START; i < SELF_START + SELF_SIZE; ++i) {
        self.at(i) = FF((i * 11) + 1);
    }
    for (size_t i = OTHER_START; i < OTHER_START + OTHER_SIZE; ++i) {
        other.at(i) = FF((i * 17) + 3);
    }
    Poly self_ref = self;

    self -= other;

    for (size_t i = OTHER_START; i < OTHER_START + OTHER_SIZE; ++i) {
        self_ref.at(i) = self_ref.at(i) - other.at(i);
    }
    for (size_t i = SELF_START; i < SELF_START + SELF_SIZE; ++i) {
        EXPECT_EQ(self.at(i), self_ref.at(i)) << "i=" << i;
    }
}

TEST(Polynomial, MultiplyAssignVectorizedMatchesScalar)
{
    using FF = bb::fr;
    using Poly = bb::Polynomial<FF>;
    // 17 elements covers a full 5-wide block plus a non-trivial tail (12 → 2),
    // and the start offset keeps the buffer's contiguous range unaligned.
    constexpr size_t SIZE = 17;
    constexpr size_t VSIZE = 24;
    constexpr size_t START = 3;

    Poly p(SIZE, VSIZE, START);
    for (size_t i = START; i < START + SIZE; ++i) {
        p.at(i) = FF((i * 13) + 5);
    }
    Poly p_ref = p;
    FF scalar = FF(11);

    p *= scalar;

    for (size_t i = START; i < START + SIZE; ++i) {
        p_ref.at(i) = p_ref.at(i) * scalar;
    }
    for (size_t i = START; i < START + SIZE; ++i) {
        EXPECT_EQ(p.at(i), p_ref.at(i)) << "i=" << i;
    }
}

// evaluate_mle on a 0-variable MLE returns the constant coefficient.
TEST(Polynomial, EvaluateMleSingleCoefficientEmptyPoints)
{
    using FF = bb::fr;
    bb::Polynomial<FF> poly(1);
    poly.at(0) = FF(42);
    std::vector<FF> u; // empty — zero-variable MLE
    EXPECT_EQ(poly.evaluate_mle(u), FF(42));
}

// evaluate_mle({}) must be paired with virtual_size() == 1, mirroring the
// `virtual_size == 1 << n` precondition enforced for n > 0. A multi-coefficient polynomial
// evaluated at zero points is a dimension mismatch, not a meaningful constant.
TEST(Polynomial, EvaluateMleEmptyPointsRejectsMultiCoefficient)
{
    GTEST_FLAG_SET(death_test_style, "threadsafe");
    using FF = bb::fr;
    bb::Polynomial<FF> poly(2); // virtual_size == 2
    poly.at(0) = FF(1);
    poly.at(1) = FF(2);
    std::vector<FF> u; // empty — caller incorrectly treats poly as 0-variable
    ASSERT_THROW_OR_ABORT(poly.evaluate_mle(u), ".*");
}

// full() materializes a shifted polynomial with virtual zeros on both sides into a dense 0..virtual_size buffer;
// coefficient values outside the original [start_index, end_index) must be zero.
TEST(Polynomial, FullPreservesCoefficients)
{
    using FF = bb::fr;
    const size_t virtual_size = 16;
    const size_t start = 3;
    const size_t size = 5;
    auto poly = bb::Polynomial<FF>(size, virtual_size, start);
    for (size_t i = 0; i < size; ++i) {
        poly.at(start + i) = FF(i + 100);
    }
    auto full = poly.full();
    EXPECT_EQ(full.start_index(), 0UL);
    EXPECT_EQ(full.end_index(), virtual_size);
    for (size_t i = 0; i < virtual_size; ++i) {
        const bool in_backed_range = i >= start && i < start + size;
        const FF expected = in_backed_range ? FF(i - start + 100) : FF(0);
        EXPECT_EQ(full[i], expected) << "mismatch at index " << i;
    }
}

#ifndef NDEBUG
// Only run in an assert-enabled test suite.
TEST(Polynomial, AddScaledEdgeConditions)
{
    // Suppress warnings about fork(), we're OK with the edge cases.
    GTEST_FLAG_SET(death_test_style, "threadsafe");
    using FF = bb::fr;
    auto test_subset_good = []() {
        // Contained within poly
        auto poly = bb::Polynomial<FF>::random(4, /*start index*/ 0);
        poly.add_scaled(bb::Polynomial<FF>::random(4, /*start index*/ 1), 1);
    };
    ASSERT_NO_FATAL_FAILURE(test_subset_good());
    auto test_subset_bad1 = []() {
        // Not contained within poly
        auto poly = bb::Polynomial<FF>::random(4, /*start index*/ 1);
        poly.add_scaled(bb::Polynomial<FF>::random(4, /*start index*/ 0), 1);
    };
    ASSERT_THROW_OR_ABORT(test_subset_bad1(), ".*start_index.*other.start_index.*");
    auto test_subset_bad2 = []() {
        // Not contained within poly
        auto poly = bb::Polynomial<FF>::random(4, /*start index*/ 0);
        poly.add_scaled(bb::Polynomial<FF>::random(5, /*start index*/ 0), 1);
    };
    ASSERT_THROW_OR_ABORT(test_subset_bad2(), ".*end_index.*other.end_index.*");
}

TEST(Polynomial, OperatorAddEdgeConditions)
{
    // Suppress warnings about fork(), we're OK with the edge cases.
    GTEST_FLAG_SET(death_test_style, "threadsafe");
    using FF = bb::fr;
    auto test_subset_good = []() {
        // Contained within poly
        auto poly = bb::Polynomial<FF>::random(4, /*start index*/ 0);
        poly += bb::Polynomial<FF>::random(4, /*start index*/ 1);
    };
    ASSERT_NO_FATAL_FAILURE(test_subset_good());
    auto test_subset_bad1 = []() {
        // Not contained within poly
        auto poly = bb::Polynomial<FF>::random(4, /*start index*/ 1);
        poly += bb::Polynomial<FF>::random(4, /*start index*/ 0);
    };
    ASSERT_THROW_OR_ABORT(test_subset_bad1(), ".*start_index.*other.start_index.*");
    auto test_subset_bad2 = []() {
        // Not contained within poly
        auto poly = bb::Polynomial<FF>::random(4, /*start index*/ 0);
        poly += bb::Polynomial<FF>::random(5, /*start index*/ 0);
    };
    ASSERT_THROW_OR_ABORT(test_subset_bad2(), ".*end_index.*other.end_index.*");
}

TEST(Polynomial, OperatorSubtractEdgeConditions)
{
    // Suppress warnings about fork(), we're OK with the edge cases.
    GTEST_FLAG_SET(death_test_style, "threadsafe");
    using FF = bb::fr;
    auto test_subset_good = []() {
        // Contained within poly
        auto poly = bb::Polynomial<FF>::random(4, /*start index*/ 0);
        poly -= bb::Polynomial<FF>::random(4, /*start index*/ 1);
    };
    ASSERT_NO_FATAL_FAILURE(test_subset_good());
    auto test_subset_bad1 = []() {
        // Not contained within poly
        auto poly = bb::Polynomial<FF>::random(4, /*start index*/ 1);
        poly -= bb::Polynomial<FF>::random(4, /*start index*/ 0);
    };
    ASSERT_THROW_OR_ABORT(test_subset_bad1(), ".*start_index.*other.start_index.*");
    auto test_subset_bad2 = []() {
        // Not contained within poly
        auto poly = bb::Polynomial<FF>::random(4, /*start index*/ 0);
        poly -= bb::Polynomial<FF>::random(5, /*start index*/ 0);
    };
    ASSERT_THROW_OR_ABORT(test_subset_bad2(), ".*end_index.*other.end_index.*");
}

// Makes a vector fully of the virtual_size aka degree + 1
TEST(Polynomial, Full)
{
    // Suppress warnings about fork(), we're OK with the edge cases.
    GTEST_FLAG_SET(death_test_style, "threadsafe");
    using FF = bb::fr;
    size_t degree_plus_1 = 10;
    auto full_good = [=]() {
        auto poly = bb::Polynomial<FF>::random(1, degree_plus_1, /*start index*/ degree_plus_1 - 1);
        poly = poly.full();
        poly -= bb::Polynomial<FF>::random(degree_plus_1, /*start index*/ 0);
    };
    ASSERT_NO_FATAL_FAILURE(full_good());
    auto no_full_bad = [=]() {
        auto poly = bb::Polynomial<FF>::random(1, degree_plus_1, /*start index*/ degree_plus_1 - 1);
        poly -= bb::Polynomial<FF>::random(degree_plus_1, /*start index*/ 0);
    };
    ASSERT_THROW_OR_ABORT(no_full_bad(), ".*start_index.*other.start_index.*");
}

#endif

// Polynomial::random asserts when start_index > size (would underflow the subtraction).
TEST(Polynomial, RandomStartIndexExceedsSizeAsserts)
{
    GTEST_FLAG_SET(death_test_style, "threadsafe");
    using FF = bb::fr;
    ASSERT_THROW_OR_ABORT(bb::Polynomial<FF>::random(/*size=*/4, /*start_index=*/10), ".*");
}

// shrink_end_index asserts when the new end is below start_index (would underflow size()).
TEST(Polynomial, ShrinkEndIndexBelowStartIndexAsserts)
{
    GTEST_FLAG_SET(death_test_style, "threadsafe");
    using FF = bb::fr;
    // Polynomial with start_index=2, end_index=10.
    auto poly = bb::Polynomial<FF>(/*size=*/8, /*virtual_size=*/16, /*start_index=*/2);
    ASSERT_THROW_OR_ABORT(poly.shrink_end_index(1), ".*");
}
