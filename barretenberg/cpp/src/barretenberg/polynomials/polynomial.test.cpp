#include <cstddef>
#include <gtest/gtest.h>

#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/polynomials/file_backed_polynomial.hpp"

namespace bb {

// Test fixture for polynomial tests
template <typename PolynomialType>
class PolynomialTest : public ::testing::Test {
  public:
    using FF = bb::fr;
    using Poly = PolynomialType;
};

// Define the types to test - always test both implementations
using PolynomialTypes = ::testing::Types<MemoryPolynomial<bb::fr>, FileBackedPolynomial<bb::fr>>;
TYPED_TEST_SUITE(PolynomialTest, PolynomialTypes);

// Simple test/demonstration of shifted functionality
TYPED_TEST(PolynomialTest, Shifted)
{
    using Polynomial = TypeParam;
    const size_t SIZE = 10;
    auto poly = Polynomial::random(SIZE, /*shiftable*/ 1);

    // Instantiate the shift via the shifted method
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

// Simple test/demonstration of right_shifted functionality
TYPED_TEST(PolynomialTest, RightShifted)
{
    using Polynomial = TypeParam;
    const size_t SIZE = 10;
    const size_t VIRTUAL_SIZE = 20;
    const size_t START_IDX = 2;
    const size_t SHIFT_MAGNITUDE = 5;
    auto poly = Polynomial::random(SIZE, VIRTUAL_SIZE, START_IDX);

    // Instantiate the shift via the right_shifted method
    auto poly_shifted = poly.right_shifted(SHIFT_MAGNITUDE);

    EXPECT_EQ(poly_shifted.size(), poly.size());
    EXPECT_EQ(poly_shifted.virtual_size(), poly.virtual_size());

    // The shift is indeed the shift
    for (size_t i = 0; i < SIZE; ++i) {
        EXPECT_EQ(poly_shifted.get(i + SHIFT_MAGNITUDE), poly.get(i));
    }

    // If I change the original polynomial, the shift is updated accordingly
    poly.at(3) = 25;
    for (size_t i = 0; i < SIZE; ++i) {
        EXPECT_EQ(poly_shifted.get(i + SHIFT_MAGNITUDE), poly.get(i));
    }
}

// Simple test/demonstration of share functionality
TYPED_TEST(PolynomialTest, Share)
{
    using Polynomial = TypeParam;
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
TYPED_TEST(PolynomialTest, Indices)
{
    using Polynomial = TypeParam;
    auto poly = Polynomial::random(100, /*offset*/ 1);
    EXPECT_EQ(poly.start_index(), 1);
    EXPECT_EQ((*poly.indices().begin()), poly.start_index());
    EXPECT_EQ(std::get<0>(*poly.indexed_values().begin()), poly.start_index());
    EXPECT_EQ(std::get<1>(*poly.indexed_values().begin()), poly[poly.start_index()]);
}

#ifndef NDEBUG
// Only run in an assert-enabled test suite.
TYPED_TEST(PolynomialTest, AddScaledEdgeConditions)
{
    // Suppress warnings about fork(), we're OK with the edge cases.
    GTEST_FLAG_SET(death_test_style, "threadsafe");
    using Polynomial = TypeParam;
    using FF = typename Polynomial::FF;
    auto test_subset_good = [&]() {
        // Contained within poly
        auto poly = Polynomial::random(4, /*start index*/ 0);
        poly.add_scaled(Polynomial::random(4, /*start index*/ 1), FF(1));
    };
    ASSERT_NO_FATAL_FAILURE(test_subset_good());
    auto test_subset_bad1 = [&]() {
        // Not contained within poly
        auto poly = Polynomial::random(4, /*start index*/ 1);
        poly.add_scaled(Polynomial::random(4, /*start index*/ 0), FF(1));
    };
    ASSERT_DEATH(test_subset_bad1(), ".*start_index.*other.start_index.*");
    auto test_subset_bad2 = [&]() {
        // Not contained within poly
        auto poly = Polynomial::random(4, /*start index*/ 0);
        poly.add_scaled(Polynomial::random(5, /*start index*/ 0), FF(1));
    };
    ASSERT_DEATH(test_subset_bad2(), ".*end_index.*other.end_index.*");
}

TYPED_TEST(PolynomialTest, OperatorAddEdgeConditions)
{
    // Suppress warnings about fork(), we're OK with the edge cases.
    GTEST_FLAG_SET(death_test_style, "threadsafe");
    using Polynomial = TypeParam;
    auto test_subset_good = [&]() {
        // Contained within poly
        auto poly = Polynomial::random(4, /*start index*/ 0);
        poly += Polynomial::random(4, /*start index*/ 1);
    };
    ASSERT_NO_FATAL_FAILURE(test_subset_good());
    auto test_subset_bad1 = [&]() {
        // Not contained within poly
        auto poly = Polynomial::random(4, /*start index*/ 1);
        poly += Polynomial::random(4, /*start index*/ 0);
    };
    ASSERT_DEATH(test_subset_bad1(), ".*start_index.*other.start_index.*");
    auto test_subset_bad2 = [&]() {
        // Not contained within poly
        auto poly = Polynomial::random(4, /*start index*/ 0);
        poly += Polynomial::random(5, /*start index*/ 0);
    };
    ASSERT_DEATH(test_subset_bad2(), ".*end_index.*other.end_index.*");
}

TYPED_TEST(PolynomialTest, OperatorSubtractEdgeConditions)
{
    // Suppress warnings about fork(), we're OK with the edge cases.
    GTEST_FLAG_SET(death_test_style, "threadsafe");
    using Polynomial = TypeParam;
    auto test_subset_good = [&]() {
        // Contained within poly
        auto poly = Polynomial::random(4, /*start index*/ 0);
        poly -= Polynomial::random(4, /*start index*/ 1);
    };
    ASSERT_NO_FATAL_FAILURE(test_subset_good());
    auto test_subset_bad1 = [&]() {
        // Not contained within poly
        auto poly = Polynomial::random(4, /*start index*/ 1);
        poly -= Polynomial::random(4, /*start index*/ 0);
    };
    ASSERT_DEATH(test_subset_bad1(), ".*start_index.*other.start_index.*");
    auto test_subset_bad2 = [&]() {
        // Not contained within poly
        auto poly = Polynomial::random(4, /*start index*/ 0);
        poly -= Polynomial::random(5, /*start index*/ 0);
    };
    ASSERT_DEATH(test_subset_bad2(), ".*end_index.*other.end_index.*");
}

// Makes a vector fully of the virtual_size aka degree + 1
TYPED_TEST(PolynomialTest, Full)
{
    // Suppress warnings about fork(), we're OK with the edge cases.
    GTEST_FLAG_SET(death_test_style, "threadsafe");
    using Polynomial = TypeParam;
    size_t degree_plus_1 = 10;
    auto full_good = [&]() {
        auto poly = Polynomial::random(1, degree_plus_1, /*start index*/ degree_plus_1 - 1);
        poly = poly.full();
        poly -= Polynomial::random(degree_plus_1, /*start index*/ 0);
    };
    ASSERT_NO_FATAL_FAILURE(full_good());
    auto no_full_bad = [&]() {
        auto poly = Polynomial::random(1, degree_plus_1, /*start index*/ degree_plus_1 - 1);
        poly -= Polynomial::random(degree_plus_1, /*start index*/ 0);
    };
    ASSERT_DEATH(no_full_bad(), ".*start_index.*other.start_index.*");
}

// TODO(https://github.com/AztecProtocol/barretenberg/issues/1113): Optimizing based on actual sizes would involve using
// expand, but it is currently unused.
TYPED_TEST(PolynomialTest, Expand)
{
    // Suppress warnings about fork(), we're OK with the edge cases.
    GTEST_FLAG_SET(death_test_style, "threadsafe");
    using Polynomial = TypeParam;
    auto test_subset_good = [&]() {
        // Expand legally within poly
        auto poly = Polynomial::random(4, 10, /*start index*/ 1);
        poly.expand(1, 6);
        poly.expand(0, 9);
        poly.expand(0, 10);
    };
    ASSERT_NO_FATAL_FAILURE(test_subset_good());

    auto test_subset_bad1 = [&]() {
        auto poly = Polynomial::random(4, 10, /*start index*/ 1);
        // Expand beyond virtual size
        poly.expand(1, 11);
    };
    ASSERT_DEATH(test_subset_bad1(), ".*new_end_index.*virtual_size.*");

    auto test_subset_bad2 = [&]() {
        auto poly = Polynomial::random(5, 10, /*start index*/ 1);
        // Expand illegally on start_index
        poly.expand(2, 7);
    };
    ASSERT_DEATH(test_subset_bad2(), ".*new_start_index.*start_index.*");

    auto test_subset_bad3 = [&]() {
        auto poly = Polynomial::random(5, 10, /*start_index*/ 1);
        // Expand illegally on end_index
        poly.expand(1, 3);
    };
    ASSERT_DEATH(test_subset_bad3(), ".*new_end_index.*end_index.*");
}

#endif

// Test that evaluate_mle gives same result for both polynomial types
TEST(PolynomialTest, EvaluateMleConsistency)
{
    using FF = bb::fr;
    const size_t n = 4; // 2^2 = 4 coefficients
    
    // Create identical polynomials with both implementations
    auto mem_poly = MemoryPolynomial<FF>::random(1 << n);
    FileBackedPolynomial<FF> file_poly(mem_poly.coeffs(), mem_poly.virtual_size());
    
    // Test evaluation points
    std::vector<FF> eval_points = { FF::random_element(), FF::random_element() };
    
    // Evaluate both polynomials at the same point
    FF mem_result = mem_poly.evaluate_mle(eval_points);
    FF file_result = file_poly.evaluate_mle(eval_points);
    
    EXPECT_EQ(mem_result, file_result);
}

} // namespace bb