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

// Test strided view: entity views into interleaved group buffer
TEST(Polynomial, StridedView)
{
    using FF = bb::fr;
    using Polynomial = bb::Polynomial<FF>;
    constexpr size_t BS = 4;
    constexpr size_t N = 8; // logical size per entity

    // Allocate the group buffer (non-shiftable: all n*BS elements)
    Polynomial group_buffer(N * BS);

    // Fill it manually: buffer[BS*i + j] = (i+1) * 100 + j
    for (size_t i = 0; i < N; i++) {
        for (size_t j = 0; j < BS; j++) {
            group_buffer.at(BS * i + j) = FF(static_cast<uint64_t>((i + 1) * 100 + j));
        }
    }

    // Create strided views for each entity
    std::array<Polynomial, BS> entities;
    for (size_t j = 0; j < BS; j++) {
        entities[j] = Polynomial::strided_view(
            group_buffer.backing_memory(), BS, j, /*start_index=*/0, /*logical_size=*/N, /*virtual_size=*/N);
    }

    // Verify reads through strided views
    for (size_t j = 0; j < BS; j++) {
        EXPECT_TRUE(entities[j].is_strided());
        EXPECT_EQ(entities[j].size(), N);
        EXPECT_EQ(entities[j].virtual_size(), N);
        for (size_t i = 0; i < N; i++) {
            FF expected = FF(static_cast<uint64_t>((i + 1) * 100 + j));
            EXPECT_EQ(entities[j].get(i), expected) << "entity " << j << " at index " << i;
        }
    }

    // Verify writes through strided views go into the group buffer
    entities[2].at(3) = FF(999);
    EXPECT_EQ(group_buffer.at(BS * 3 + 2), FF(999));

    // Verify reads past logical end return zero (virtual zeros)
    // (entities have virtual_size = N, so reading at N should return zero)
    // Can't test this without increasing virtual_size > N; skip for now.
}

// Test strided view for shiftable entities
TEST(Polynomial, StridedViewShiftable)
{
    using FF = bb::fr;
    using Polynomial = bb::Polynomial<FF>;
    constexpr size_t BS = 4;
    constexpr size_t N = 8; // logical circuit size

    // Allocate shiftable group buffer: first BS positions are zero
    Polynomial group_buffer = Polynomial::shiftable(N * BS, N * BS, BS);

    // Fill non-zero rows: buffer[BS*i + j] for i >= 1
    for (size_t i = 1; i < N; i++) {
        for (size_t j = 0; j < BS; j++) {
            group_buffer.at(BS * i + j) = FF(static_cast<uint64_t>(i * 10 + j));
        }
    }

    // Create shiftable strided views (start_index=1, logical_size=N-1)
    std::array<Polynomial, BS> entities;
    for (size_t j = 0; j < BS; j++) {
        entities[j] = Polynomial::strided_view(
            group_buffer.backing_memory(), BS, j, /*start_index=*/1, /*logical_size=*/N - 1, /*virtual_size=*/N);
    }

    // Verify entity reads: entity_j[i] = buffer[BS*i + j]
    for (size_t j = 0; j < BS; j++) {
        EXPECT_TRUE(entities[j].is_shiftable());
        // get(0) should return zero (before start_index)
        EXPECT_EQ(entities[j].get(0), FF(0));
        for (size_t i = 1; i < N; i++) {
            FF expected = FF(static_cast<uint64_t>(i * 10 + j));
            EXPECT_EQ(entities[j].get(i), expected) << "entity " << j << " at index " << i;
        }
    }

    // Create shifted views
    std::array<Polynomial, BS> shifted;
    for (size_t j = 0; j < BS; j++) {
        shifted[j] = entities[j].shifted();
    }

    // Verify shifted reads: shifted_j[i] = entity_j[i+1]
    for (size_t j = 0; j < BS; j++) {
        for (size_t i = 0; i < N - 2; i++) {
            EXPECT_EQ(shifted[j].get(i), entities[j].get(i + 1)) << "shifted entity " << j << " at index " << i;
        }
    }

    // Verify writes through entity view update the buffer and shifted view sees it
    entities[1].at(3) = FF(42);
    EXPECT_EQ(group_buffer.at(BS * 3 + 1), FF(42));
    EXPECT_EQ(shifted[1].get(2), FF(42)); // shifted[2] = entity[3]
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
