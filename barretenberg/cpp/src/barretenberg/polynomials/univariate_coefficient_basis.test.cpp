#include "univariate_coefficient_basis.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "univariate.hpp"
#include <bitset>
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

// `VectorField::is_zero()` (bool form) and `UnivariateCoefficientBasis<Vec>::is_zero()` must both mean
// "every lane of every coefficient is zero". Selector-gated prover relations use these as the skip
// predicate; a partial-zero lane pattern reading as "is_zero == true" would drop a subrelation whose
// selector fires on at least one of the rows packed into the lanes.
#include "barretenberg/ecc/fields/vector_field.hpp"

namespace {

using Vec = bb::VectorField<bb::Bn254FrParams>;

bb::fr fr_from_lane(size_t lane, bool nonzero)
{
    // Distinct nonzero value per lane so a lane-mixing bug surfaces as a wrong value, not just a non-zero one.
    return nonzero ? bb::fr(static_cast<uint64_t>(0x100 + lane)) : bb::fr::zero();
}

Vec vec_lane_pattern(uint32_t nonzero_mask)
{
    std::array<bb::fr, 5> lanes{};
    for (size_t i = 0; i < 5; ++i) {
        lanes[i] = fr_from_lane(i, (nonzero_mask >> i) & 1u);
    }
    return Vec(lanes);
}

} // namespace

TEST(VectorFieldIsZeroBool, AllZeroLanesIsZero)
{
    EXPECT_TRUE(vec_lane_pattern(0b00000).is_zero());
    EXPECT_EQ(vec_lane_pattern(0b00000).is_zero_mask(), 0b11111u);
}

TEST(VectorFieldIsZeroBool, AllNonZeroLanesIsNotZero)
{
    EXPECT_FALSE(vec_lane_pattern(0b11111).is_zero());
    EXPECT_EQ(vec_lane_pattern(0b11111).is_zero_mask(), 0u);
}

// Mixed lane patterns (e.g. one row carries `lagrange_first = 1`, the other lanes hold rows where it's
// zero). Each must read as not-zero so the relation gate fires on the row that needs it.
TEST(VectorFieldIsZeroBool, PartiallyNonZeroLanesIsNotZero)
{
    for (uint32_t pattern : { 0b00001u, 0b00010u, 0b00100u, 0b01000u, 0b10000u, 0b01010u, 0b11110u, 0b10101u }) {
        EXPECT_FALSE(vec_lane_pattern(pattern).is_zero()) << "pattern=0b" << std::bitset<5>(pattern);
    }
}

// `UnivariateCoefficientBasis<Vec>::is_zero()` is the actual call site for the relation gate
// (`gate.is_zero()` where `gate` is a `CoefficientAccumulator`); a non-zero lane anywhere in any
// coefficient must read as not-zero.
TEST(UnivariateCoefficientBasisVec, IsZeroFalseWhenSingleLaneIsNonZero)
{
    using UCB = bb::UnivariateCoefficientBasis<Vec, 2, true>;
    UCB gate;
    gate.coefficients[0] = vec_lane_pattern(0b00001);
    gate.coefficients[1] = vec_lane_pattern(0b00000);
    gate.coefficients[2] = gate.coefficients[0];
    EXPECT_FALSE(gate.is_zero());
}

TEST(UnivariateCoefficientBasisVec, IsZeroTrueOnlyWhenAllLanesZero)
{
    using UCB = bb::UnivariateCoefficientBasis<Vec, 2, true>;
    UCB gate;
    gate.coefficients[0] = vec_lane_pattern(0b00000);
    gate.coefficients[1] = vec_lane_pattern(0b00000);
    gate.coefficients[2] = vec_lane_pattern(0b00000);
    EXPECT_TRUE(gate.is_zero());
}
