#include <cstddef>
#include <gtest/gtest.h>

#include "barretenberg/polynomials/polynomial.hpp"

using namespace bb;

// Test basic put and get functionality
TEST(Polynomial, Shifted)
{
    using FF = bb::fr;
    using Polynomial = Polynomial<FF>;
    const size_t SIZE = 10;
    auto poly = Polynomial::random(SIZE);
    poly[0] = 0; // make it shiftable

    auto poly_shifted = poly.shifted();

    EXPECT_EQ(poly_shifted.size(), poly.size());

    // WORKTODO: this should be true:
    // EXPECT_EQ(poly_shifted.capacity(), poly.capacity() - 1);

    for (size_t i = 0; i < poly_shifted.size(); ++i) {
        EXPECT_EQ(poly_shifted.at(i), poly.at(i + 1));
    }

    poly[3] = 25;

    for (size_t i = 0; i < poly_shifted.size(); ++i) {
        EXPECT_EQ(poly_shifted.at(i), poly.at(i + 1));
    }
}

TEST(Polynomial, Share)
{
    using FF = bb::fr;
    using Polynomial = Polynomial<FF>;
    const size_t SIZE = 10;
    auto poly = Polynomial::random(SIZE);

    auto poly_clone = poly.share();

    for (size_t i = 0; i < poly.size(); ++i) {
        EXPECT_EQ(poly_clone.at(i), poly.at(i));
    }

    poly[3] = 25;

    for (size_t i = 0; i < poly.size(); ++i) {
        EXPECT_EQ(poly_clone.at(i), poly.at(i));
    }
}
