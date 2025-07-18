#include "sumcheck_round.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/relations/utils.hpp"

#include <gtest/gtest.h>

using namespace bb;

/**
 * @brief Test SumcheckRound functions for operations on tuples (and tuples of tuples) of Univariates
 *
 */
TEST(SumcheckRound, SumcheckTupleOfTuplesOfUnivariates)
{
    using Flavor = UltraFlavor;
    using FF = typename Flavor::FF;
    using SubrelationSeparators = typename Flavor::SubrelationSeparators;

    // Define three linear univariates of different sizes
    Univariate<FF, 3> univariate_1({ 1, 2, 3 });
    Univariate<FF, 2> univariate_2({ 2, 4 });
    Univariate<FF, 5> univariate_3({ 3, 4, 5, 6, 7 });
    const size_t MAX_LENGTH = 5;

    // Construct a tuple of tuples of the form { {univariate_1}, {univariate_2, univariate_3} }
    auto tuple_of_tuples = std::make_tuple(std::make_tuple(univariate_1), std::make_tuple(univariate_2, univariate_3));

    // Use scale_univariate_accumulators to scale by challenge powers
    SubrelationSeparators challenge = {};
    challenge[0] = 5;
    challenge[1] = 25;
    RelationUtils<Flavor>::scale_univariates(tuple_of_tuples, challenge);

    // Use extend_and_batch_univariates to extend to MAX_LENGTH then accumulate
    GateSeparatorPolynomial<FF> gate_separators({ 1 });
    auto result = Univariate<FF, MAX_LENGTH>();
    SumcheckProverRound<Flavor>::extend_and_batch_univariates(tuple_of_tuples, result, gate_separators);

    // Repeat the batching process manually
    auto result_expected = univariate_1.template extend_to<MAX_LENGTH>() +
                           univariate_2.template extend_to<MAX_LENGTH>() * challenge[0] +
                           univariate_3.template extend_to<MAX_LENGTH>() * challenge[1];

    // Compare final batched univariates
    EXPECT_EQ(result, result_expected);

    // Reinitialize univariate accumulators to zero
    RelationUtils<Flavor>::zero_univariates(tuple_of_tuples);

    // Check that reinitialization was successful
    Univariate<FF, 3> expected_1({ 0, 0, 0 });
    Univariate<FF, 2> expected_2({ 0, 0 });
    Univariate<FF, 5> expected_3({ 0, 0, 0, 0, 0 });
    EXPECT_EQ(std::get<0>(std::get<0>(tuple_of_tuples)), expected_1);
    EXPECT_EQ(std::get<0>(std::get<1>(tuple_of_tuples)), expected_2);
    EXPECT_EQ(std::get<1>(std::get<1>(tuple_of_tuples)), expected_3);
}

/**
 * @brief Test utility functions for applying operations to tuple of std::arrays of field elements
 *
 */
TEST(SumcheckRound, TuplesOfEvaluationArrays)
{
    using Flavor = UltraFlavor;
    using Utils = RelationUtils<Flavor>;
    using FF = typename Flavor::FF;
    using SubrelationSeparators = typename Flavor::SubrelationSeparators;

    // Define two arrays of arbitrary elements
    std::array<FF, 2> evaluations_1 = { 4, 3 };
    std::array<FF, 2> evaluations_2 = { 6, 2 };

    // Construct a tuple
    auto tuple_of_arrays = std::make_tuple(evaluations_1, evaluations_2);

    // Use scale_and_batch_elements to scale by challenge powers
    SubrelationSeparators challenge{ 5, 25, 125 };

    FF result = Utils::scale_and_batch_elements(tuple_of_arrays, challenge);

    // Repeat the batching process manually
    auto result_expected = evaluations_1[0] + evaluations_1[1] * challenge[0] + evaluations_2[0] * challenge[1] +
                           evaluations_2[1] * challenge[2];

    // Compare batched result
    EXPECT_EQ(result, result_expected);

    // Reinitialize univariate accumulators to zero
    Utils::zero_elements(tuple_of_arrays);

    EXPECT_EQ(std::get<0>(tuple_of_arrays)[0], 0);
    EXPECT_EQ(std::get<1>(tuple_of_arrays)[0], 0);
    EXPECT_EQ(std::get<1>(tuple_of_arrays)[1], 0);
}

/**
 * @brief Test utility functions for adding two tuples of tuples of Univariates
 *
 */
TEST(SumcheckRound, AddTuplesOfTuplesOfUnivariates)
{
    using Flavor = UltraFlavor;
    using FF = typename Flavor::FF;

    // Define some arbitrary univariates
    Univariate<FF, 2> univariate_1({ 1, 2 });
    Univariate<FF, 2> univariate_2({ 2, 4 });
    Univariate<FF, 3> univariate_3({ 3, 4, 5 });

    Univariate<FF, 2> univariate_4({ 3, 6 });
    Univariate<FF, 2> univariate_5({ 8, 1 });
    Univariate<FF, 3> univariate_6({ 3, 7, 1 });

    Univariate<FF, 2> expected_sum_1 = univariate_1 + univariate_4;
    Univariate<FF, 2> expected_sum_2 = univariate_2 + univariate_5;
    Univariate<FF, 3> expected_sum_3 = univariate_3 + univariate_6;

    // Construct two tuples of tuples of univariates
    auto tuple_of_tuples_1 =
        std::make_tuple(std::make_tuple(univariate_1), std::make_tuple(univariate_2, univariate_3));
    auto tuple_of_tuples_2 =
        std::make_tuple(std::make_tuple(univariate_4), std::make_tuple(univariate_5, univariate_6));

    RelationUtils<Flavor>::add_nested_tuples(tuple_of_tuples_1, tuple_of_tuples_2);

    EXPECT_EQ(std::get<0>(std::get<0>(tuple_of_tuples_1)), expected_sum_1);
    EXPECT_EQ(std::get<0>(std::get<1>(tuple_of_tuples_1)), expected_sum_2);
    EXPECT_EQ(std::get<1>(std::get<1>(tuple_of_tuples_1)), expected_sum_3);
}
