#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/relations/multilinear_batching/multilinear_batching_relation.hpp"
#include "barretenberg/relations/relation_parameters.hpp"

#include <array>
#include <gtest/gtest.h>

using namespace bb;

using FF = fr;

namespace {

struct InputElements {
    FF w_non_shifted_accumulator;
    FF w_non_shifted_instance;
    FF w_evaluations_accumulator;
    FF w_evaluations_instance;
    FF w_shifted_accumulator;
    FF w_shifted_instance;

    static InputElements special() { return { FF(1), FF(2), FF(3), FF(4), FF(5), FF(6) }; }

    static InputElements random()
    {
        return { FF::random_element(), FF::random_element(), FF::random_element(),
                 FF::random_element(), FF::random_element(), FF::random_element() };
    }
};

} // namespace

class MultilinearBatchingAccumulatorRelationConsistency : public testing::Test {
  protected:
    using Relation = MultilinearBatchingAccumulatorRelation<FF>;
    using SumcheckArrayOfValuesOverSubrelations = typename Relation::SumcheckArrayOfValuesOverSubrelations;
};

class MultilinearBatchingInstanceRelationConsistency : public testing::Test {
  protected:
    using Relation = MultilinearBatchingInstanceRelation<FF>;
    using SumcheckArrayOfValuesOverSubrelations = typename Relation::SumcheckArrayOfValuesOverSubrelations;
};

TEST_F(MultilinearBatchingAccumulatorRelationConsistency, AccumulateMatchesDirectComputation)
{
    const auto run_case =
        [](const InputElements& inputs, const SumcheckArrayOfValuesOverSubrelations& seed, const FF& scaling_factor) {
            SumcheckArrayOfValuesOverSubrelations accumulator = seed;
            SumcheckArrayOfValuesOverSubrelations expected = seed;

            expected[0] += inputs.w_non_shifted_accumulator * inputs.w_evaluations_accumulator * scaling_factor;
            expected[1] += inputs.w_shifted_accumulator * inputs.w_evaluations_accumulator * scaling_factor;

            const auto parameters = RelationParameters<FF>::get_random();
            Relation::accumulate(accumulator, inputs, parameters, scaling_factor);

            EXPECT_EQ(accumulator, expected);
        };

    SumcheckArrayOfValuesOverSubrelations zero_seed{ FF(0), FF(0) };
    run_case(InputElements::special(), zero_seed, FF(1));

    SumcheckArrayOfValuesOverSubrelations random_seed{ FF::random_element(), FF::random_element() };
    run_case(InputElements::random(), random_seed, FF::random_element());
}

TEST_F(MultilinearBatchingInstanceRelationConsistency, AccumulateMatchesDirectComputation)
{
    const auto run_case =
        [](const InputElements& inputs, const SumcheckArrayOfValuesOverSubrelations& seed, const FF& scaling_factor) {
            SumcheckArrayOfValuesOverSubrelations accumulator = seed;
            SumcheckArrayOfValuesOverSubrelations expected = seed;

            expected[0] += inputs.w_non_shifted_instance * inputs.w_evaluations_instance * scaling_factor;
            expected[1] += inputs.w_shifted_instance * inputs.w_evaluations_instance * scaling_factor;

            const auto parameters = RelationParameters<FF>::get_random();
            Relation::accumulate(accumulator, inputs, parameters, scaling_factor);

            EXPECT_EQ(accumulator, expected);
        };

    SumcheckArrayOfValuesOverSubrelations zero_seed{ FF(0), FF(0) };
    run_case(InputElements::special(), zero_seed, FF(1));

    SumcheckArrayOfValuesOverSubrelations random_seed{ FF::random_element(), FF::random_element() };
    run_case(InputElements::random(), random_seed, FF::random_element());
}

TEST_F(MultilinearBatchingAccumulatorRelationConsistency, SkipLogic)
{
    // Test case 1: w_evaluations_accumulator is zero -> should skip
    InputElements zero_evaluations;
    zero_evaluations.w_non_shifted_accumulator = FF::random_element();
    zero_evaluations.w_non_shifted_instance = FF::random_element();
    zero_evaluations.w_shifted_accumulator = FF::random_element();
    zero_evaluations.w_shifted_instance = FF::random_element();
    zero_evaluations.w_evaluations_accumulator = FF(0);
    zero_evaluations.w_evaluations_instance = FF::random_element();

    EXPECT_TRUE(Relation::skip(zero_evaluations));

    // Test case 2: both w_non_shifted_accumulator and w_shifted_accumulator are zero -> should skip
    InputElements zero_accumulators;
    zero_accumulators.w_non_shifted_accumulator = FF(0);
    zero_accumulators.w_non_shifted_instance = FF::random_element();
    zero_accumulators.w_shifted_accumulator = FF(0);
    zero_accumulators.w_shifted_instance = FF::random_element();
    zero_accumulators.w_evaluations_accumulator = FF::random_element();
    zero_accumulators.w_evaluations_instance = FF::random_element();

    EXPECT_TRUE(Relation::skip(zero_accumulators));

    // Test case 3: w_non_shifted_accumulator is non-zero, w_evaluations_accumulator is non-zero -> should not skip
    InputElements non_zero_case;
    non_zero_case.w_non_shifted_accumulator = FF(1);
    non_zero_case.w_non_shifted_instance = FF::random_element();
    non_zero_case.w_shifted_accumulator = FF::random_element();
    non_zero_case.w_shifted_instance = FF::random_element();
    non_zero_case.w_evaluations_accumulator = FF(1);
    non_zero_case.w_evaluations_instance = FF::random_element();

    EXPECT_FALSE(Relation::skip(non_zero_case));
}

TEST_F(MultilinearBatchingInstanceRelationConsistency, SkipLogic)
{
    // Test case 1: both w_evaluations_accumulator and w_evaluations_instance are zero -> should skip
    InputElements zero_evaluations;
    zero_evaluations.w_non_shifted_accumulator = FF::random_element();
    zero_evaluations.w_non_shifted_instance = FF::random_element();
    zero_evaluations.w_shifted_accumulator = FF::random_element();
    zero_evaluations.w_shifted_instance = FF::random_element();
    zero_evaluations.w_evaluations_accumulator = FF(0);
    zero_evaluations.w_evaluations_instance = FF(0);

    EXPECT_TRUE(Relation::skip(zero_evaluations));

    // Test case 2: all shifted/non-shifted fields are zero -> should skip
    InputElements zero_all_shifted;
    zero_all_shifted.w_non_shifted_accumulator = FF(0);
    zero_all_shifted.w_non_shifted_instance = FF(0);
    zero_all_shifted.w_shifted_accumulator = FF(0);
    zero_all_shifted.w_shifted_instance = FF(0);
    zero_all_shifted.w_evaluations_accumulator = FF::random_element();
    zero_all_shifted.w_evaluations_instance = FF::random_element();

    EXPECT_TRUE(Relation::skip(zero_all_shifted));

    // Test case 3: w_evaluations_accumulator is zero but w_evaluations_instance is non-zero -> should not skip
    InputElements accumulator_eval_zero;
    accumulator_eval_zero.w_non_shifted_accumulator = FF::random_element();
    accumulator_eval_zero.w_non_shifted_instance = FF::random_element();
    accumulator_eval_zero.w_shifted_accumulator = FF::random_element();
    accumulator_eval_zero.w_shifted_instance = FF::random_element();
    accumulator_eval_zero.w_evaluations_accumulator = FF(0);
    accumulator_eval_zero.w_evaluations_instance = FF(1);

    EXPECT_FALSE(Relation::skip(accumulator_eval_zero));

    // Test case 4: w_evaluations_instance is zero but w_evaluations_accumulator is non-zero -> should not skip
    InputElements instance_eval_zero;
    instance_eval_zero.w_non_shifted_accumulator = FF::random_element();
    instance_eval_zero.w_non_shifted_instance = FF::random_element();
    instance_eval_zero.w_shifted_accumulator = FF::random_element();
    instance_eval_zero.w_shifted_instance = FF::random_element();
    instance_eval_zero.w_evaluations_accumulator = FF(1);
    instance_eval_zero.w_evaluations_instance = FF(0);

    EXPECT_FALSE(Relation::skip(instance_eval_zero));

    // Test case 5: all non-zero -> should not skip
    InputElements all_non_zero;
    all_non_zero.w_non_shifted_accumulator = FF(1);
    all_non_zero.w_non_shifted_instance = FF(1);
    all_non_zero.w_shifted_accumulator = FF(1);
    all_non_zero.w_shifted_instance = FF(1);
    all_non_zero.w_evaluations_accumulator = FF(1);
    all_non_zero.w_evaluations_instance = FF(1);

    EXPECT_FALSE(Relation::skip(all_non_zero));
}
