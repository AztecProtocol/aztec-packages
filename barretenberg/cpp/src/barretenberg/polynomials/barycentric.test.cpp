#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "univariate.hpp"
#include <gtest/gtest.h>

using namespace bb;

template <class FF> class BarycentricDataTests : public testing::Test {};

using FieldTypes = testing::Types<bb::fr>;
TYPED_TEST_SUITE(BarycentricDataTests, FieldTypes);

#define BARYCENTIC_DATA_TESTS_TYPE_ALIASES using FF = TypeParam;

/**
 * @brief Ensure auxilliary arrays (e.g. big_domain) are computed at compile time if possible (i.e. if FF is a native
 * field)
 *
 */
TYPED_TEST(BarycentricDataTests, CompileTimeComputation)
{
    BARYCENTIC_DATA_TESTS_TYPE_ALIASES
    const size_t domain_size(2);
    const size_t num_evals(10);

    static_assert(BarycentricData<FF, domain_size, num_evals>::big_domain[5] == 5);
}

TYPED_TEST(BarycentricDataTests, Extend)
{
    BARYCENTIC_DATA_TESTS_TYPE_ALIASES
    const size_t domain_size(2);
    const size_t num_evals(10);
    auto f = Univariate<FF, domain_size>({ 1, 2 });
    auto expected_result = Univariate<FF, num_evals>({ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 });
    auto result = f.template extend_to<num_evals>();
    EXPECT_EQ(result, expected_result);
}

TYPED_TEST(BarycentricDataTests, SelfExtend)
{
    BARYCENTIC_DATA_TESTS_TYPE_ALIASES
    static constexpr size_t initial_size(2);
    static constexpr size_t domain_size(10);
    auto f = Univariate<FF, domain_size>({ 1, 2, 0, 0, 0, 0, 0, 0, 0, 0 });
    auto expected_result = Univariate<FF, domain_size>({ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 });
    f.template self_extend_from<initial_size>();
    EXPECT_EQ(f, expected_result);
}

TYPED_TEST(BarycentricDataTests, Evaluate)
{
    BARYCENTIC_DATA_TESTS_TYPE_ALIASES
    const size_t domain_size(2);
    auto f = Univariate<FF, domain_size>({ 1, 2 });
    FF u = 5;
    FF expected_result = 6;
    auto result = f.evaluate(u);
    EXPECT_EQ(result, expected_result);
}

TYPED_TEST(BarycentricDataTests, BarycentricData2to3)
{
    BARYCENTIC_DATA_TESTS_TYPE_ALIASES

    const size_t domain_size = 2;
    const size_t num_evals = 3;
    auto barycentric = BarycentricData<FF, domain_size, num_evals>();
    std::array<FF, 3> expected_big_domain{ { 0, 1, 2 } };
    std::array<FF, 2> expected_denominators{ { -1, 1 } };
    std::array<FF, 3> expected_full_numerator_values{ { 0, 0, 2 } };
    EXPECT_EQ(barycentric.big_domain, expected_big_domain);
    EXPECT_EQ(barycentric.lagrange_denominators, expected_denominators);
    EXPECT_EQ(barycentric.full_numerator_values, expected_full_numerator_values);

    // e1(X) = 1*(1-X) + 2*X = 1 + X
    Univariate<FF, 2> e1{ { 1, 2 } };
    FF u = FF::random_element();
    FF calculated_val_at_u = e1.evaluate(u);
    EXPECT_EQ(u + 1, calculated_val_at_u);

    Univariate<FF, 3> ext1 = e1.template extend_to<num_evals>();
    Univariate<FF, 3> expected{ { 1, 2, 3 } };
    EXPECT_EQ(ext1, expected);
}

TYPED_TEST(BarycentricDataTests, BarycentricData5to6)
{
    BARYCENTIC_DATA_TESTS_TYPE_ALIASES

    const size_t domain_size = 5;
    const size_t num_evals = 6;

    // Note: we are able to represent a degree 4 polynomial with 5 points thus this
    // extension will succeed. It would fail for values on a polynomial of degree > 4.
    Univariate<FF, domain_size> e1{ { 1, 3, 25, 109, 321 } }; // X^4 + X^3 + 1
    Univariate<FF, num_evals> ext1 = e1.template extend_to<num_evals>();
    Univariate<FF, num_evals> expected{ { 1, 3, 25, 109, 321, 751 } };
    EXPECT_EQ(ext1, expected);
}

/**
 * @brief Tests for the BarycentricDataRunTime path using stdlib field_t
 */
using Builder = bb::UltraCircuitBuilder;
using field_ct = bb::stdlib::field_t<Builder>;
using witness_ct = bb::stdlib::witness_t<Builder>;

// Verify that BarycentricDataRunTime computes the same precomputed arrays as the compile-time native version
TEST(BarycentricDataRunTimeTests, DataArraysMatchCompileTime2to3)
{
    constexpr size_t domain_size = 2;
    constexpr size_t num_evals = 3;
    using RuntimeData = BarycentricDataRunTime<field_ct, domain_size, num_evals>;
    using NativeData = BarycentricDataCompileTime<bb::fr, domain_size, num_evals>;

    for (size_t i = 0; i < RuntimeData::big_domain_size; ++i) {
        EXPECT_EQ(RuntimeData::big_domain[i].get_value(), NativeData::big_domain[i]);
    }
    for (size_t i = 0; i < domain_size; ++i) {
        EXPECT_EQ(RuntimeData::lagrange_denominators[i].get_value(), NativeData::lagrange_denominators[i]);
    }
    for (size_t i = 0; i < domain_size * num_evals; ++i) {
        EXPECT_EQ(RuntimeData::precomputed_denominator_inverses[i].get_value(),
                  NativeData::precomputed_denominator_inverses[i]);
    }
    for (size_t i = 0; i < num_evals; ++i) {
        EXPECT_EQ(RuntimeData::full_numerator_values[i].get_value(), NativeData::full_numerator_values[i]);
    }
}

TEST(BarycentricDataRunTimeTests, DataArraysMatchCompileTime5to6)
{
    constexpr size_t domain_size = 5;
    constexpr size_t num_evals = 6;
    using RuntimeData = BarycentricDataRunTime<field_ct, domain_size, num_evals>;
    using NativeData = BarycentricDataCompileTime<bb::fr, domain_size, num_evals>;

    for (size_t i = 0; i < RuntimeData::big_domain_size; ++i) {
        EXPECT_EQ(RuntimeData::big_domain[i].get_value(), NativeData::big_domain[i]);
    }
    for (size_t i = 0; i < domain_size; ++i) {
        EXPECT_EQ(RuntimeData::lagrange_denominators[i].get_value(), NativeData::lagrange_denominators[i]);
    }
    for (size_t i = 0; i < domain_size * num_evals; ++i) {
        EXPECT_EQ(RuntimeData::precomputed_denominator_inverses[i].get_value(),
                  NativeData::precomputed_denominator_inverses[i]);
    }
    for (size_t i = 0; i < num_evals; ++i) {
        EXPECT_EQ(RuntimeData::full_numerator_values[i].get_value(), NativeData::full_numerator_values[i]);
    }
}

// Evaluate a linear polynomial f(X) = 1 + X at a witness point
TEST(BarycentricDataRunTimeTests, Evaluate)
{
    Builder builder;
    constexpr size_t domain_size = 2;

    // f(X) = 1 + X: f(0)=1, f(1)=2
    field_ct v0 = witness_ct(&builder, bb::fr(1));
    field_ct v1 = witness_ct(&builder, bb::fr(2));
    auto f = Univariate<field_ct, domain_size>(std::array<field_ct, domain_size>{ v0, v1 });

    field_ct u = witness_ct(&builder, bb::fr(5));
    auto result = f.evaluate(u);
    EXPECT_EQ(result.get_value(), bb::fr(6)); // f(5) = 1 + 5 = 6

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Extend a degree-1 polynomial from 2 to 10 evaluations
TEST(BarycentricDataRunTimeTests, Extend)
{
    Builder builder;
    constexpr size_t domain_size = 2;
    constexpr size_t num_evals = 10;

    // X + 1: f(0)=1, f(1)=2
    auto e1 = Univariate<field_ct, domain_size>(
        std::array<field_ct, domain_size>{ witness_ct(&builder, bb::fr(1)), witness_ct(&builder, bb::fr(2)) });
    auto ext1 = e1.template extend_to<num_evals>();

    std::array<bb::fr, num_evals> expected = { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 };
    for (size_t i = 0; i < num_evals; ++i) {
        EXPECT_EQ(ext1.value_at(i).get_value(), expected[i]);
    }

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Extend a degree-4 polynomial from 5 to 6 evaluations using the general barycentric path (LENGTH >= 5)
TEST(BarycentricDataRunTimeTests, Extend5to6)
{
    Builder builder;
    constexpr size_t domain_size = 5;
    constexpr size_t num_evals = 6;

    // X^4 + X^3 + 1: f(0)=1, f(1)=3, f(2)=25, f(3)=109, f(4)=321
    auto e1 = Univariate<field_ct, domain_size>(std::array<field_ct, domain_size>{ witness_ct(&builder, bb::fr(1)),
                                                                                   witness_ct(&builder, bb::fr(3)),
                                                                                   witness_ct(&builder, bb::fr(25)),
                                                                                   witness_ct(&builder, bb::fr(109)),
                                                                                   witness_ct(&builder, bb::fr(321)) });
    auto ext1 = e1.template extend_to<num_evals>();

    std::array<bb::fr, num_evals> expected = { 1, 3, 25, 109, 321, 751 };
    for (size_t i = 0; i < num_evals; ++i) {
        EXPECT_EQ(ext1.value_at(i).get_value(), expected[i]);
    }

    EXPECT_TRUE(CircuitChecker::check(builder));
}
