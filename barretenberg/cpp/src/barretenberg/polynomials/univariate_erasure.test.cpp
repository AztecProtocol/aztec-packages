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

TEST(UnivariateErasureTest, AdditionReturnsNew)
{
    ErasedUnivariate<fr> f1(Univariate<fr, 2>{ { 1, 2 } });
    ErasedUnivariate<fr> f2(Univariate<fr, 2>{ { 3, 4 } });
    auto f3 = f1 + f2;
    EXPECT_EQ(f3.value_at(0), fr(4));
    EXPECT_EQ(f3.value_at(1), fr(6));
    // original unchanged
    EXPECT_EQ(f1.value_at(0), fr(1));
    EXPECT_EQ(f1.value_at(1), fr(2));
    EXPECT_EQ(f2.value_at(0), fr(3));
    EXPECT_EQ(f2.value_at(1), fr(4));
}

TEST(UnivariateErasureTest, PlusScalarReturnsNew)
{
    ErasedUnivariate<fr> f(Univariate<fr, 3>{ { 1, 2, 3 } });
    auto g = f + fr(10);
    // original unchanged
    EXPECT_EQ(f.value_at(0), fr(1));
    EXPECT_EQ(f.value_at(1), fr(2));
    EXPECT_EQ(f.value_at(2), fr(3));
    // new has +10
    EXPECT_EQ(g.value_at(0), fr(11));
    EXPECT_EQ(g.value_at(1), fr(12));
    EXPECT_EQ(g.value_at(2), fr(13));
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

TEST(UnivariateErasureTest, SubtractionReturnsNew)
{
    ErasedUnivariate<fr> f1(Univariate<fr, 2>{ { 1, 2 } });
    ErasedUnivariate<fr> f2(Univariate<fr, 2>{ { 3, 4 } });
    auto f3 = f1 - f2;
    EXPECT_EQ(f3.value_at(0), fr(-2));
    EXPECT_EQ(f3.value_at(1), fr(-2));
    // original unchanged
    EXPECT_EQ(f1.value_at(0), fr(1));
    EXPECT_EQ(f1.value_at(1), fr(2));
    EXPECT_EQ(f2.value_at(0), fr(3));
    EXPECT_EQ(f2.value_at(1), fr(4));
}

TEST(UnivariateErasureTest, MinusScalarReturnsNew)
{
    ErasedUnivariate<fr> f(Univariate<fr, 3>{ { 1, 2, 3 } });
    auto g = f - fr(10);
    // original unchanged
    EXPECT_EQ(f.value_at(0), fr(1));
    EXPECT_EQ(f.value_at(1), fr(2));
    EXPECT_EQ(f.value_at(2), fr(3));
    // new has -10
    EXPECT_EQ(g.value_at(0), fr(-9));
    EXPECT_EQ(g.value_at(1), fr(-8));
    EXPECT_EQ(g.value_at(2), fr(-7));
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

TEST(UnivariateErasureTest, MultiplicationReturnsNew)
{
    ErasedUnivariate<fr> f1(Univariate<fr, 2>{ { 1, 2 } });
    ErasedUnivariate<fr> f2(Univariate<fr, 2>{ { 3, 4 } });
    auto f3 = f1 * f2;
    EXPECT_EQ(f3.value_at(0), fr(3));
    EXPECT_EQ(f3.value_at(1), fr(8));
    // original unchanged
    EXPECT_EQ(f1.value_at(0), fr(1));
    EXPECT_EQ(f1.value_at(1), fr(2));
    EXPECT_EQ(f2.value_at(0), fr(3));
    EXPECT_EQ(f2.value_at(1), fr(4));
}

TEST(UnivariateErasureTest, MultiplicationByScalarReturnsNew)
{
    ErasedUnivariate<fr> f(Univariate<fr, 3>{ { 1, 2, 3 } });
    auto g = f * fr(10);
    // original unchanged
    EXPECT_EQ(f.value_at(0), fr(1));
    EXPECT_EQ(f.value_at(1), fr(2));
    EXPECT_EQ(f.value_at(2), fr(3));
    // new has *10
    EXPECT_EQ(g.value_at(0), fr(10));
    EXPECT_EQ(g.value_at(1), fr(20));
    EXPECT_EQ(g.value_at(2), fr(30));
}
