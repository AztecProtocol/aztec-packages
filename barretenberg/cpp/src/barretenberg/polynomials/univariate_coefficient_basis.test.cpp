#include "univariate_coefficient_basis.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "univariate.hpp"
#include <gtest/gtest.h>

using namespace bb;

template <typename FF> class UnivariateCoefficientBasisTest : public testing::Test {
  public:
    template <size_t view_length> using UnivariateView = UnivariateView<FF, view_length>;
};

using FieldTypes = testing::Types<fr>;
TYPED_TEST_SUITE(UnivariateCoefficientBasisTest, FieldTypes);

TYPED_TEST(UnivariateCoefficientBasisTest, Conversion)
{
    fr a0 = fr::random_element();
    fr a1 = fr::random_element();

    Univariate<fr, 2> expected({ a0, a1 });
    UnivariateCoefficientBasis<fr, 2, true> uni_m(expected);
    Univariate<fr, 2> result(uni_m);
    EXPECT_EQ(result, expected);
}

TYPED_TEST(UnivariateCoefficientBasisTest, Addition)
{
    Univariate<fr, 2> f1{ { 1, 2 } };
    Univariate<fr, 2> f2{ { 3, 4 } };
    UnivariateCoefficientBasis<fr, 2, true> f1_m(f1);
    UnivariateCoefficientBasis<fr, 2, true> f2_m(f2);

    Univariate<fr, 2> result(f1_m + f2_m);
    Univariate<fr, 2> expected = f1 + f2;
    EXPECT_EQ(result, expected);
}

TYPED_TEST(UnivariateCoefficientBasisTest, Multiplication)
{

    Univariate<fr, 2> f1({ 1, 2 });
    Univariate<fr, 2> f2({ 3, 4 });
    UnivariateCoefficientBasis<fr, 2, true> f1_m(f1);
    UnivariateCoefficientBasis<fr, 2, true> f2_m(f2);

    Univariate<fr, 3> result(f1_m * f2_m);
    Univariate<fr, 3> expected = (f1.template extend_to<3>()) * (f2.template extend_to<3>());
    EXPECT_EQ(result, expected);
}

TYPED_TEST(UnivariateCoefficientBasisTest, Serialization)
{
    const size_t LENGTH = 2;
    std::array<fr, LENGTH> evaluations;

    for (size_t i = 0; i < LENGTH; ++i) {
        evaluations[i] = fr::random_element();
    }

    // Instantiate a Univariate from the evaluations
    auto univariate = Univariate<fr, LENGTH>(evaluations);
    UnivariateCoefficientBasis<fr, LENGTH, true> univariate_m(univariate);
    // Serialize univariate to buffer
    std::vector<uint8_t> buffer = univariate_m.to_buffer();

    // Deserialize
    auto deserialized_univariate =
        Univariate<fr, LENGTH>(UnivariateCoefficientBasis<fr, LENGTH, true>::serialize_from_buffer(&buffer[0]));

    for (size_t i = 0; i < LENGTH; ++i) {
        EXPECT_EQ(univariate.value_at(i), deserialized_univariate.value_at(i));
    }
}
