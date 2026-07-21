#include "relation_types.hpp"
#include "barretenberg/common/tuple.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/relations/relation_tuple_helpers.hpp"

#include <gtest/gtest.h>

using namespace bb;

TEST(RelationTypes, CreateSumcheckTupleOfTuplesOfUnivariates)
{
    using FF = fr;

    struct Relation1 {
        using SumcheckTupleOfUnivariatesOverSubrelations =
            TupleOfUnivariates<FF, /*SUBRELATION_PARTIAL_LENGTHS=*/std::array<size_t, 1>{ 3 }>;
    };
    struct Relation2 {
        using SumcheckTupleOfUnivariatesOverSubrelations =
            TupleOfUnivariates<FF, /*SUBRELATION_PARTIAL_LENGTHS=*/std::array<size_t, 2>{ 2, 5 }>;
    };
    using RelationsTuple = flat_tuple::tuple<Relation1, Relation2>;
    auto tuple_of_tuples = create_sumcheck_tuple_of_tuples_of_univariates<RelationsTuple>();

    Univariate<FF, 3> expected_zero_1({ 0, 0, 0 });
    Univariate<FF, 2> expected_zero_2({ 0, 0 });
    Univariate<FF, 5> expected_zero_3({ 0, 0, 0, 0, 0 });
    EXPECT_EQ(std::get<0>(std::get<0>(tuple_of_tuples)), expected_zero_1);
    EXPECT_EQ(std::get<0>(std::get<1>(tuple_of_tuples)), expected_zero_2);
    EXPECT_EQ(std::get<1>(std::get<1>(tuple_of_tuples)), expected_zero_3);

    // Now test it when creating it from the type.
    using SumcheckTupleOfTuplesOfUnivariates =
        decltype(create_sumcheck_tuple_of_tuples_of_univariates<RelationsTuple>());
    // Note: {} is required to initialize the tuple contents. Otherwise the univariates contain garbage.
    SumcheckTupleOfTuplesOfUnivariates tuple_of_tuples_from_type{};

    EXPECT_EQ(std::get<0>(std::get<0>(tuple_of_tuples_from_type)), expected_zero_1);
    EXPECT_EQ(std::get<0>(std::get<1>(tuple_of_tuples_from_type)), expected_zero_2);
    EXPECT_EQ(std::get<1>(std::get<1>(tuple_of_tuples_from_type)), expected_zero_3);
}

// This class needs to be outside the test because of the templated skip.
struct RelationWithTemplatedSkip {
    struct AllEntities {
        int input;
    };
    template <typename Entities> static bool skip(const Entities&) { return false; }
};

TEST(RelationTypes, IsSkippableConcept)
{
    // Works with a non-templated skip function.
    struct Relation1 {
        struct AllEntities {
            int input;
        };
        static bool skip(const AllEntities&) { return false; }
    };
    static_assert(isSkippable<Relation1, Relation1::AllEntities>);

    // Works with a templated skip function.
    static_assert(isSkippable<RelationWithTemplatedSkip, RelationWithTemplatedSkip::AllEntities>);

    // False when the skip function is not there.
    struct Relation2 {
        struct AllEntities {
            int input;
        };
    };
    static_assert(!isSkippable<Relation2, Relation2::AllEntities>);

    struct Relation3 {};
}

TEST(RelationParameters, GetRandomSetsBetaQuartic)
{
    const auto params = RelationParameters<fr>::get_random();

    EXPECT_NE(params.beta_quartic, fr(0));
    EXPECT_EQ(params.beta_quartic, params.beta_cube * params.beta);

    // eccvm_set_permutation_delta uses first_term_tag = FIRST_TERM_TAG (= 1) * beta_quartic.
    const fr g = params.gamma;
    const fr b2 = params.beta_sqr;
    const fr tag = params.beta_quartic;
    const fr expected = (g + tag) * (g + b2 + tag) * (g + b2 + b2 + tag) * (g + b2 + b2 + b2 + tag);
    EXPECT_EQ(params.eccvm_set_permutation_delta, expected);

    const fr wrong_zero_tag = g * (g + b2) * (g + b2 + b2) * (g + b2 + b2 + b2);
    EXPECT_NE(params.eccvm_set_permutation_delta, wrong_zero_tag);
}
