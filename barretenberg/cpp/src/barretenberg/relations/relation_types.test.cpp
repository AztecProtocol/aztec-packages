#include "relation_types.hpp"
#include "barretenberg/common/tuple.hpp"
#include "barretenberg/flavor/flavor.hpp"

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
