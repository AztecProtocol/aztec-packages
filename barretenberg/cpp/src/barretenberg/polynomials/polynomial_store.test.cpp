#include <cstddef>
#include <gtest/gtest.h>

#include "barretenberg/polynomials/polynomial.hpp"
#include "polynomial_store.hpp"

using namespace bb;

// Test basic put and get functionality
TEST(PolynomialStore, PutThenGet)
{
    PolynomialStore<fr> polynomial_store;

    // Instantiate a polynomial with random coefficients
    Polynomial<fr> poly(1024);
    for (auto& coeff : poly) {
        coeff = fr::random_element();
    }

    // Make a copy for comparison after original is moved into container
    Polynomial<fr> poly_copy(poly);

    // Move the poly into the container
    polynomial_store.put("id", std::move(poly));

    // Confirm equality of the copy and the original poly that now resides in the container
    EXPECT_EQ(poly_copy, polynomial_store.get("id"));
}

// Ensure that attempt to access non-existent key throws out_of_range exception
TEST(PolynomialStore, NonexistentKey)
{
    PolynomialStore<fr> polynomial_store;

    polynomial_store.put("id_1", Polynomial<fr>(100));

    polynomial_store.get("id_1"); // no problem!

    EXPECT_THROW(polynomial_store.get("id_2"), std::out_of_range);
}

// Ensure correct calculation of volume in bytes
TEST(PolynomialStore, Volume)
{
    PolynomialStore<fr> polynomial_store;
    size_t size1 = 100;
    size_t size2 = 10;
    size_t size3 = 5000;

    Polynomial<fr> poly1(size1);
    Polynomial<fr> poly2(size2);
    Polynomial<fr> poly3(size3);

    polynomial_store.put("id_1", std::move(poly1));
    polynomial_store.put("id_2", std::move(poly2));
    polynomial_store.put("id_3", std::move(poly3));

    // polynomial_store.print();

    size_t bytes_expected = sizeof(fr) * (size1 + size2 + size3);

    EXPECT_EQ(polynomial_store.get_size_in_bytes(), bytes_expected);
}

// Ensure that the remove method erases entry and reduces memory
TEST(PolynomialStore, Remove)
{
    PolynomialStore<fr> polynomial_store;
    size_t size1 = 100;
    size_t size2 = 500;
    Polynomial<fr> poly1(size1);
    Polynomial<fr> poly2(size2);

    polynomial_store.put("id_1", std::move(poly1));
    polynomial_store.put("id_2", std::move(poly2));

    size_t bytes_expected = sizeof(fr) * (size1 + size2);

    EXPECT_EQ(polynomial_store.get_size_in_bytes(), bytes_expected);

    polynomial_store.remove("id_1");

    bytes_expected -= sizeof(fr) * size1;

    EXPECT_THROW(polynomial_store.get("id_1"), std::out_of_range);
    EXPECT_EQ(polynomial_store.get_size_in_bytes(), bytes_expected);
}
