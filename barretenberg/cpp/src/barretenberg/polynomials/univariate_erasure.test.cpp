#include "univariate_erasure.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
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

TEST(UnivariateErasureTest, CopyConstructor)
{
    ErasedUnivariate<fr> uni = Univariate<fr, 3>{ { 1, 2, 3 } };
    ErasedUnivariate<fr> uni2(uni);
    EXPECT_EQ(uni2.value_at(0), fr(1));
    EXPECT_EQ(uni2.value_at(1), fr(2));
    EXPECT_EQ(uni2.value_at(2), fr(3));
}

TEST(UnivariateErasureTest, Assignment)
{
    ErasedUnivariate<fr> uni = Univariate<fr, 3>{ { 1, 2, 3 } };
    ErasedUnivariate<fr> uni2 = Univariate<fr, 3>{ { 4, 5, 6 } };
    uni2 = uni;
    EXPECT_EQ(uni2.value_at(0), fr(1));
    EXPECT_EQ(uni2.value_at(1), fr(2));
    EXPECT_EQ(uni2.value_at(2), fr(3));
    EXPECT_EQ(uni.value_at(0), fr(1));
    EXPECT_EQ(uni.value_at(1), fr(2));
    EXPECT_EQ(uni.value_at(2), fr(3));
}

TEST(UnivariateErasureTest, MoveConstructor)
{
    ErasedUnivariate<fr> uni = Univariate<fr, 3>{ { 1, 2, 3 } };
    ErasedUnivariate<fr> uni2(std::move(uni));
    EXPECT_EQ(uni2.value_at(0), fr(1));
    EXPECT_EQ(uni2.value_at(1), fr(2));
    EXPECT_EQ(uni2.value_at(2), fr(3));
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

TEST(UnivariateErasureTest, PlusScalarConvertsToFr)
{
    ErasedUnivariate<fr> f(Univariate<fr, 3>{ { 1, 2, 3 } });
    auto g = f + 10;
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

TEST(UnivariateErasureTest, NegationReturnsNew)
{
    ErasedUnivariate<fr> f(Univariate<fr, 3>{ { 1, 2, 3 } });
    auto g = -f;
    // original unchanged
    EXPECT_EQ(f.value_at(0), fr(1));
    EXPECT_EQ(f.value_at(1), fr(2));
    EXPECT_EQ(f.value_at(2), fr(3));
    // new has -1, -2, -3
    EXPECT_EQ(g.value_at(0), fr(-1));
    EXPECT_EQ(g.value_at(1), fr(-2));
    EXPECT_EQ(g.value_at(2), fr(-3));
}

/////////// WIP ///////////

#include "barretenberg/common/tuple.hpp"
#include "barretenberg/relations/relation_parameters.hpp"

// Since type information is lost, we cannot just define a TupleOfTupleOfUnivariates and instantiate it.
// Instead, we need to create the univariates manually from the Relations.
template <typename Relation> constexpr auto create_relation_univariates()
{
    constexpr auto seq = std::make_index_sequence<Relation::SUBRELATION_PARTIAL_LENGTHS.size()>();
    return []<size_t... I>(std::index_sequence<I...>) {
        return flat_tuple::make_tuple(ErasedUnivariate<typename Relation::FF>(
            Univariate<typename Relation::FF, Relation::SUBRELATION_PARTIAL_LENGTHS[I]>{})...);
    }(seq);
}

// template <typename RelationsTuple> constexpr auto create_sumcheck_tuple_of_tuples_of_univariates()
// {
//     constexpr auto seq = std::make_index_sequence<std::tuple_size_v<RelationsTuple>>();
//     return []<size_t... I>(std::index_sequence<I...>) {
//         return flat_tuple::make_tuple(
//             // typename std::tuple_element_t<I, RelationsTuple>::SumcheckTupleOfUnivariatesOverSubrelations{}...);
//             TupleOfUnivariates<typename std::tuple_element_t<I, RelationsTuple>::FF,
//                                std::tuple_element_t<I, RelationsTuple>::SUBRELATION_PARTIAL_LENGTHS>{}...);
//     }(seq);
// }

struct FFEntities {
    fr sel = 0;
};

struct UnivariateEntities {
    // Bigger univariate.
    bb::Univariate<fr, 7> sel{};
};

auto ViewFor(auto& acc)
{
    return [&acc](const auto& uv) { return acc.view(uv); };
}

struct Relation1 {
    using FF = fr;
    static constexpr std::array<size_t, 3> SUBRELATION_PARTIAL_LENGTHS = { 3, 2, 5 };

    template <typename ContainerOverSubrelations, typename AllEntities>
    void static accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& in,
                           [[maybe_unused]] const RelationParameters<FF>&,
                           [[maybe_unused]] const FF& scaling_factor)
    {
        {
            auto& acc = std::get<0>(evals);
            auto view = ViewFor(acc);

            auto tmp = view(in.sel) * (FF(1) - view(in.sel));
            tmp *= scaling_factor;

            acc += tmp;
        }
        {
            auto& acc = std::get<1>(evals);
            auto view = ViewFor(acc);

            auto tmp = view(in.sel) * (FF(1) - view(in.sel));
            tmp *= scaling_factor;

            acc += tmp;
        }
        {
            auto& acc = std::get<2>(evals);
            auto view = ViewFor(acc);

            auto tmp = view(in.sel) * (FF(1) - view(in.sel));
            tmp *= scaling_factor;

            acc += tmp;
        }
    }
};

// TEST(UnivariateErasureTest, RelationUnivariateCreation)
// {
//     auto unis = create_relation_univariates<Relation1>();
//     FFEntities in = { .sel = 1 };
//     Relation1::accumulate(unis, in, RelationParameters<fr>{}, fr(1));
//     EXPECT_EQ(std::get<0>(unis).value_at(0), fr(0));
//     EXPECT_EQ(std::get<0>(unis).value_at(1), fr(0));
//     EXPECT_EQ(std::get<0>(unis).value_at(2), fr(0));
//     EXPECT_EQ(std::get<1>(unis).value_at(0), fr(0));
//     EXPECT_EQ(std::get<1>(unis).value_at(1), fr(0));
//     EXPECT_EQ(std::get<2>(unis).value_at(0), fr(0));
//     EXPECT_EQ(std::get<2>(unis).value_at(1), fr(0));
//     EXPECT_EQ(std::get<2>(unis).value_at(2), fr(0));
//     EXPECT_EQ(std::get<2>(unis).value_at(3), fr(0));
//     EXPECT_EQ(std::get<2>(unis).value_at(4), fr(0));
// }

TEST(UnivariateErasureTest, RelationUnivariateCreationWithUnivariateEntities)
{
    auto unis = create_relation_univariates<Relation1>();
    UnivariateEntities in;
    Relation1::accumulate(unis, in, RelationParameters<fr>{}, fr(1));
    EXPECT_EQ(std::get<0>(unis).value_at(0), fr(0));
    EXPECT_EQ(std::get<0>(unis).value_at(1), fr(0));
    EXPECT_EQ(std::get<0>(unis).value_at(2), fr(0));
    EXPECT_EQ(std::get<1>(unis).value_at(0), fr(0));
    EXPECT_EQ(std::get<1>(unis).value_at(1), fr(0));
    EXPECT_EQ(std::get<2>(unis).value_at(0), fr(0));
    EXPECT_EQ(std::get<2>(unis).value_at(1), fr(0));
    EXPECT_EQ(std::get<2>(unis).value_at(2), fr(0));
    EXPECT_EQ(std::get<2>(unis).value_at(3), fr(0));
    EXPECT_EQ(std::get<2>(unis).value_at(4), fr(0));
}
