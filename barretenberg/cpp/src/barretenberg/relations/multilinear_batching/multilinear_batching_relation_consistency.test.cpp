#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/relations/multilinear_batching/multilinear_batching_relation.hpp"
#include "barretenberg/relations/relation_parameters.hpp"

#include <array>
#include <gtest/gtest.h>

using namespace bb;

using FF = fr;

namespace {

struct InputElements {
    FF batched_unshifted_accumulator;
    FF batched_unshifted_instance;
    FF eq_accumulator;
    FF eq_instance;
    FF batched_shifted_accumulator;
    FF batched_shifted_instance;

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
    const auto run_case = [](const InputElements& inputs, const SumcheckArrayOfValuesOverSubrelations& seed) {
        SumcheckArrayOfValuesOverSubrelations accumulator = seed;
        SumcheckArrayOfValuesOverSubrelations expected = seed;

        expected[0] += inputs.batched_unshifted_accumulator * inputs.eq_accumulator;
        expected[1] += inputs.batched_shifted_accumulator * inputs.eq_accumulator;

        Relation::accumulate(accumulator, inputs);

        EXPECT_EQ(accumulator, expected);
    };

    SumcheckArrayOfValuesOverSubrelations zero_seed{ FF(0), FF(0) };
    run_case(InputElements::special(), zero_seed);

    SumcheckArrayOfValuesOverSubrelations random_seed{ FF::random_element(), FF::random_element() };
    run_case(InputElements::random(), random_seed);
}

TEST_F(MultilinearBatchingInstanceRelationConsistency, AccumulateMatchesDirectComputation)
{
    const auto run_case = [](const InputElements& inputs, const SumcheckArrayOfValuesOverSubrelations& seed) {
        SumcheckArrayOfValuesOverSubrelations accumulator = seed;
        SumcheckArrayOfValuesOverSubrelations expected = seed;

        expected[0] += inputs.batched_unshifted_instance * inputs.eq_instance;
        expected[1] += inputs.batched_shifted_instance * inputs.eq_instance;

        // const auto parameters = RelationParameters<FF>::get_random();
        Relation::accumulate(accumulator, inputs);

        EXPECT_EQ(accumulator, expected);
    };

    SumcheckArrayOfValuesOverSubrelations zero_seed{ FF(0), FF(0) };
    run_case(InputElements::special(), zero_seed);

    SumcheckArrayOfValuesOverSubrelations random_seed{ FF::random_element(), FF::random_element() };
    run_case(InputElements::random(), random_seed);
}

TEST_F(MultilinearBatchingAccumulatorRelationConsistency, SkipLogic)
{
    // Test case 1: eq_accumulator is zero -> should skip
    InputElements zero_eq;
    zero_eq.batched_unshifted_accumulator = FF::random_element();
    zero_eq.batched_unshifted_instance = FF::random_element();
    zero_eq.batched_shifted_accumulator = FF::random_element();
    zero_eq.batched_shifted_instance = FF::random_element();
    zero_eq.eq_accumulator = FF(0);
    zero_eq.eq_instance = FF::random_element();

    EXPECT_TRUE(Relation::skip(zero_eq));

    // Test case 2: both batched_unshifted_accumulator and batched_shifted_accumulator are zero -> should skip
    InputElements zero_accumulators;
    zero_accumulators.batched_unshifted_accumulator = FF(0);
    zero_accumulators.batched_unshifted_instance = FF::random_element();
    zero_accumulators.batched_shifted_accumulator = FF(0);
    zero_accumulators.batched_shifted_instance = FF::random_element();
    zero_accumulators.eq_accumulator = FF::random_element();
    zero_accumulators.eq_instance = FF::random_element();

    EXPECT_TRUE(Relation::skip(zero_accumulators));

    // Test case 3: batched_unshifted_accumulator is non-zero, eq_accumulator is non-zero -> should not skip
    InputElements non_zero_case;
    non_zero_case.batched_unshifted_accumulator = FF(1);
    non_zero_case.batched_unshifted_instance = FF::random_element();
    non_zero_case.batched_shifted_accumulator = FF::random_element();
    non_zero_case.batched_shifted_instance = FF::random_element();
    non_zero_case.eq_accumulator = FF(1);
    non_zero_case.eq_instance = FF::random_element();

    EXPECT_FALSE(Relation::skip(non_zero_case));
}

TEST_F(MultilinearBatchingInstanceRelationConsistency, SkipLogic)
{
    // Test case 1: both eq_accumulator and eq_instance are zero -> should skip
    InputElements zero_eq;
    zero_eq.batched_unshifted_accumulator = FF::random_element();
    zero_eq.batched_unshifted_instance = FF::random_element();
    zero_eq.batched_shifted_accumulator = FF::random_element();
    zero_eq.batched_shifted_instance = FF::random_element();
    zero_eq.eq_accumulator = FF(0);
    zero_eq.eq_instance = FF(0);

    EXPECT_TRUE(Relation::skip(zero_eq));

    // Test case 2: all shifted/non-shifted fields are zero -> should skip
    InputElements zero_all_batched;
    zero_all_batched.batched_unshifted_accumulator = FF(0);
    zero_all_batched.batched_unshifted_instance = FF(0);
    zero_all_batched.batched_shifted_accumulator = FF(0);
    zero_all_batched.batched_shifted_instance = FF(0);
    zero_all_batched.eq_accumulator = FF::random_element();
    zero_all_batched.eq_instance = FF::random_element();

    EXPECT_TRUE(Relation::skip(zero_all_batched));

    // Test case 3: eq_accumulator is zero but eq_instance is non-zero -> should not skip
    InputElements accumulator_eq_zero;
    accumulator_eq_zero.batched_unshifted_accumulator = FF::random_element();
    accumulator_eq_zero.batched_unshifted_instance = FF::random_element();
    accumulator_eq_zero.batched_shifted_accumulator = FF::random_element();
    accumulator_eq_zero.batched_shifted_instance = FF::random_element();
    accumulator_eq_zero.eq_accumulator = FF(0);
    accumulator_eq_zero.eq_instance = FF(1);

    EXPECT_FALSE(Relation::skip(accumulator_eq_zero));

    // Test case 4: eq_instance is zero but eq_accumulator is non-zero -> should not skip
    InputElements instance_eq_zero;
    instance_eq_zero.batched_unshifted_accumulator = FF::random_element();
    instance_eq_zero.batched_unshifted_instance = FF::random_element();
    instance_eq_zero.batched_shifted_accumulator = FF::random_element();
    instance_eq_zero.batched_shifted_instance = FF::random_element();
    instance_eq_zero.eq_accumulator = FF(1);
    instance_eq_zero.eq_instance = FF(0);

    EXPECT_FALSE(Relation::skip(instance_eq_zero));

    // Test case 5: all non-zero -> should not skip
    InputElements all_non_zero;
    all_non_zero.batched_unshifted_accumulator = FF(1);
    all_non_zero.batched_unshifted_instance = FF(1);
    all_non_zero.batched_shifted_accumulator = FF(1);
    all_non_zero.batched_shifted_instance = FF(1);
    all_non_zero.eq_accumulator = FF(1);
    all_non_zero.eq_instance = FF(1);

    EXPECT_FALSE(Relation::skip(all_non_zero));
}
