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

class MultilinearBatchingRelationConsistency : public testing::Test {
  protected:
    using Relation = MultilinearBatchingRelation<FF>;
    using SumcheckArrayOfValuesOverSubrelations = typename Relation::SumcheckArrayOfValuesOverSubrelations;
};

TEST_F(MultilinearBatchingRelationConsistency, AccumulateMatchesDirectComputation)
{
    const auto run_case =
        [](const InputElements& inputs, const SumcheckArrayOfValuesOverSubrelations& seed, const FF& scaling_factor) {
            SumcheckArrayOfValuesOverSubrelations accumulator = seed;
            SumcheckArrayOfValuesOverSubrelations expected = seed;

            expected[0] += inputs.w_non_shifted_accumulator * inputs.w_evaluations_accumulator * scaling_factor;
            expected[1] += inputs.w_non_shifted_instance * inputs.w_evaluations_instance * scaling_factor;
            expected[2] += inputs.w_shifted_accumulator * inputs.w_evaluations_accumulator * scaling_factor;
            expected[3] += inputs.w_shifted_instance * inputs.w_evaluations_instance * scaling_factor;

            const auto parameters = RelationParameters<FF>::get_random();
            Relation::accumulate(accumulator, inputs, parameters, scaling_factor);

            EXPECT_EQ(accumulator, expected);
        };

    SumcheckArrayOfValuesOverSubrelations zero_seed{ FF(0), FF(0), FF(0), FF(0) };
    run_case(InputElements::special(), zero_seed, FF(1));

    SumcheckArrayOfValuesOverSubrelations random_seed{
        FF::random_element(), FF::random_element(), FF::random_element(), FF::random_element()
    };
    run_case(InputElements::random(), random_seed, FF::random_element());
}

TEST_F(MultilinearBatchingRelationConsistency, SkipLogic)
{
    InputElements zero_inputs;
    zero_inputs.w_non_shifted_accumulator = FF::random_element();
    zero_inputs.w_non_shifted_instance = FF::random_element();
    zero_inputs.w_shifted_accumulator = FF::random_element();
    zero_inputs.w_shifted_instance = FF::random_element();
    zero_inputs.w_evaluations_accumulator = FF(0);
    zero_inputs.w_evaluations_instance = FF(0);

    EXPECT_TRUE(Relation::skip(zero_inputs));

    auto accumulator_non_zero = zero_inputs;
    accumulator_non_zero.w_evaluations_accumulator = FF(1);
    EXPECT_FALSE(Relation::skip(accumulator_non_zero));

    auto instance_non_zero = zero_inputs;
    instance_non_zero.w_evaluations_instance = FF(1);
    EXPECT_FALSE(Relation::skip(instance_non_zero));
}
