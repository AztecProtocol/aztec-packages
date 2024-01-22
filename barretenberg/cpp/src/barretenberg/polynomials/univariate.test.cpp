#include "univariate.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <gtest/gtest.h>

template <typename FF> class UnivariateTest : public testing::Test {
  public:
    template <size_t view_length> using UnivariateView = UnivariateView<FF, view_length>;
};

using FieldTypes = testing::Types<bb::fr>;
TYPED_TEST_SUITE(UnivariateTest, FieldTypes);

TYPED_TEST(UnivariateTest, Constructors)
{
    fr a0 = fr::random_element();
    fr a1 = fr::random_element();
    fr a2 = fr::random_element();

    Univariate<bb::fr, 3> uni({ a0, a1, a2 });

    EXPECT_EQ(uni.value_at(0), a0);
    EXPECT_EQ(uni.value_at(1), a1);
    EXPECT_EQ(uni.value_at(2), a2);
}

TYPED_TEST(UnivariateTest, Addition)
{
    Univariate<bb::fr, 2> f1{ { 1, 2 } };
    Univariate<bb::fr, 2> f2{ { 3, 4 } };
    // output should be {4, 6}
    Univariate<bb::fr, 2> expected_result{ { 4, 6 } };
    auto f1f2 = f1 + f2;
    EXPECT_EQ(f1f2, expected_result);
}

TYPED_TEST(UnivariateTest, Multiplication)
{

    Univariate<bb::fr, 3> f1 = Univariate<bb::fr, 2>{ { 1, 2 } }.template extend_to<3>();
    Univariate<bb::fr, 3> f2 = Univariate<bb::fr, 2>{ { 3, 4 } }.template extend_to<3>();
    // output should be {3, 8, 15}
    Univariate<bb::fr, 3> expected_result{ { 3, 8, 15 } };
    Univariate<bb::fr, 3> f1f2 = f1 * f2;
    EXPECT_EQ(f1f2, expected_result);
}

TYPED_TEST(UnivariateTest, ConstructUnivariateViewFromUnivariate)
{

    Univariate<bb::fr, 3> f{ { 1, 2, 3 } };
    UnivariateView<bb::fr, 2> g(f);
    EXPECT_EQ(g.value_at(0), f.value_at(0));
    EXPECT_EQ(g.value_at(1), f.value_at(1));
}

TYPED_TEST(UnivariateTest, ConstructUnivariateFromUnivariateView)
{

    Univariate<bb::fr, 3> f{ { 1, 2, 3 } };
    UnivariateView<bb::fr, 2> g(f);
    Univariate<bb::fr, 2> h(g);
    EXPECT_EQ(h.value_at(0), g.value_at(0));
    EXPECT_EQ(h.value_at(1), g.value_at(1));
}

TYPED_TEST(UnivariateTest, UnivariateViewAddition)
{
    Univariate<bb::fr, 3> f1{ { 1, 2, 3 } };
    Univariate<bb::fr, 3> f2{ { 3, 4, 3 } };

    UnivariateView<bb::fr, 2> g1(f1);
    UnivariateView<bb::fr, 2> g2(f2);

    Univariate<bb::fr, 2> expected_result{ { 4, 6 } };
    Univariate<bb::fr, 2> result = g1 + g2;
    EXPECT_EQ(result, expected_result);

    Univariate<bb::fr, 2> result2 = result + g1;
    Univariate<bb::fr, 2> expected_result2{ { 5, 8 } };
    EXPECT_EQ(result2, expected_result2);
}
TYPED_TEST(UnivariateTest, UnivariateViewSubtraction)
{
    Univariate<bb::fr, 3> f1{ { 1, 2, 3 } };
    Univariate<bb::fr, 3> f2{ { 3, 4, 3 } };

    UnivariateView<bb::fr, 2> g1(f1);
    UnivariateView<bb::fr, 2> g2(f2);

    Univariate<bb::fr, 2> expected_result{ { -2, -2 } };
    Univariate<bb::fr, 2> result = g1 - g2;
    EXPECT_EQ(result, expected_result);

    Univariate<bb::fr, 2> result2 = result - g1;
    Univariate<bb::fr, 2> expected_result2{ { -3, -4 } };
    EXPECT_EQ(result2, expected_result2);
}

TYPED_TEST(UnivariateTest, UnivariateViewMultiplication)
{
    Univariate<bb::fr, 3> f1{ { 1, 2, 3 } };
    Univariate<bb::fr, 3> f2{ { 3, 4, 3 } };

    UnivariateView<bb::fr, 2> g1(f1);
    UnivariateView<bb::fr, 2> g2(f2);

    Univariate<bb::fr, 2> expected_result{ { 3, 8 } };
    Univariate<bb::fr, 2> result = g1 * g2;
    EXPECT_EQ(result, expected_result);

    Univariate<bb::fr, 2> result2 = result * g1;
    Univariate<bb::fr, 2> expected_result2{ { 3, 16 } };
    EXPECT_EQ(result2, expected_result2);
}

TYPED_TEST(UnivariateTest, Serialization)
{
    const size_t LENGTH = 4;
    std::array<fr, LENGTH> evaluations;

    for (size_t i = 0; i < LENGTH; ++i) {
        evaluations[i] = fr::random_element();
    }

    // Instantiate a Univariate from the evaluations
    auto univariate = Univariate<bb::fr, LENGTH>(evaluations);

    // Serialize univariate to buffer
    std::vector<uint8_t> buffer = univariate.to_buffer();

    // Deserialize
    auto deserialized_univariate = Univariate<bb::fr, LENGTH>::serialize_from_buffer(&buffer[0]);

    for (size_t i = 0; i < LENGTH; ++i) {
        EXPECT_EQ(univariate.value_at(i), deserialized_univariate.value_at(i));
    }
}

TYPED_TEST(UnivariateTest, EvaluationCustomDomain)
{
    []() {
        auto poly = Univariate<bb::fr, 3, 1>(std::array<bb::fr, 2>{ 1, 2 });
        EXPECT_EQ(poly.evaluate(bb::fr(5)), bb::fr(5));
    }();

    []() {
        auto poly = Univariate<bb::fr, 37, 32>(std::array<bb::fr, 5>{ 1, 11, 111, 1111, 11111 });
        EXPECT_EQ(poly.evaluate(bb::fr(2)), bb::fr(294330751));
    }();
}
