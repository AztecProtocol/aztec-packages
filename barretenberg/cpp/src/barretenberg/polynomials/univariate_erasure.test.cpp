#include "univariate_erasure.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "univariate.hpp"

#include <gtest/gtest.h>

using namespace bb;

TEST(UnivariateErasureTest, Constructors)
{
    fr a0 = fr::random_element();
    fr a1 = fr::random_element();
    fr a2 = fr::random_element();

    ErasedUnivariate<fr> uni = Univariate<fr, 3>{ { a0, a1, a2 } };

    EXPECT_EQ(uni.value_at(0), a0);
    EXPECT_EQ(uni.value_at(1), a1);
    EXPECT_EQ(uni.value_at(2), a2);
}

TEST(UnivariateErasureTest, Evaluation)
{
    {
        ErasedUnivariate<fr> poly = Univariate<fr, 3, 1>{ { 1, 2 } };
        EXPECT_EQ(poly.evaluate(fr(5)), fr(5));
    }

    {
        ErasedUnivariate<fr> poly = Univariate<fr, 37, 32>{ { 1, 11, 111, 1111, 11111 } };
        EXPECT_EQ(poly.evaluate(fr(2)), fr(294330751));
    }
}

TEST(UnivariateErasureTest, ScalarAddition)
{
    ErasedUnivariate<fr> uni = Univariate<fr, 3>{ { 1, 2, 3 } };
    uni += fr(4);
    EXPECT_EQ(uni.value_at(0), fr(5));
    EXPECT_EQ(uni.value_at(1), fr(6));
    EXPECT_EQ(uni.value_at(2), fr(7));
}

TEST(UnivariateErasureTest, SelfAddition)
{
    ErasedUnivariate<fr> f1(Univariate<fr, 2>{ { 1, 2 } });
    ErasedUnivariate<fr> f2(Univariate<fr, 2>{ { 3, 4 } });
    // output should be {4, 6}
    f1 += f2;
    EXPECT_EQ(f1.value_at(0), fr(4));
    EXPECT_EQ(f1.value_at(1), fr(6));
}

TEST(UnivariateErasureTest, SelfSubtraction)
{
    ErasedUnivariate<fr> f1(Univariate<fr, 3>{ { 10, 20, 30 } });
    ErasedUnivariate<fr> f2(Univariate<fr, 3>{ { 1, 2, 3 } });
    f1 -= f2;
    EXPECT_EQ(f1.value_at(0), fr(9));
    EXPECT_EQ(f1.value_at(1), fr(18));
    EXPECT_EQ(f1.value_at(2), fr(27));
}

TEST(UnivariateErasureTest, SelfMultiplication)
{
    ErasedUnivariate<fr> f1(Univariate<fr, 3>{ { 10, 20, 30 } });
    ErasedUnivariate<fr> f2(Univariate<fr, 3>{ { 1, 2, 3 } });
    f1 *= f2;
    EXPECT_EQ(f1.value_at(0), fr(10));
    EXPECT_EQ(f1.value_at(1), fr(40));
    EXPECT_EQ(f1.value_at(2), fr(90));
}
