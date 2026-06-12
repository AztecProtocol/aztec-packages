#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/relations/multilinear_batching/multilinear_batching_relation.hpp"
#include "barretenberg/relations/relation_parameters.hpp"

#include <array>
#include <gtest/gtest.h>

using namespace bb;

using FF = fr;

namespace {

constexpr size_t NUM_CLAIMS = 3;

struct InputElements {
    std::array<FF, NUM_CLAIMS> non_shifted_values{};
    std::array<FF, NUM_CLAIMS> shifted_values{};
    std::array<FF, NUM_CLAIMS> eq_values{};

    const FF& non_shifted(size_t idx) const { return non_shifted_values[idx]; }
    const FF& shifted(size_t idx) const { return shifted_values[idx]; }
    const FF& eq(size_t idx) const { return eq_values[idx]; }

    static InputElements special()
    {
        InputElements result;
        for (size_t idx = 0; idx < NUM_CLAIMS; ++idx) {
            result.non_shifted_values[idx] = FF(idx + 1);
            result.shifted_values[idx] = FF(idx + 1 + NUM_CLAIMS);
            result.eq_values[idx] = FF(idx + 1 + (2 * NUM_CLAIMS));
        }
        return result;
    }

    static InputElements random()
    {
        InputElements result;
        for (size_t idx = 0; idx < NUM_CLAIMS; ++idx) {
            result.non_shifted_values[idx] = FF::random_element();
            result.shifted_values[idx] = FF::random_element();
            result.eq_values[idx] = FF::random_element();
        }
        return result;
    }
};

} // namespace

class MultilinearBatchingRelationConsistency : public testing::Test {
  protected:
    using Relation = MultilinearBatchingRelation<FF, NUM_CLAIMS>;
    using SumcheckArrayOfValuesOverSubrelations = typename Relation::SumcheckArrayOfValuesOverSubrelations;
};

TEST_F(MultilinearBatchingRelationConsistency, AccumulateMatchesDirectComputation)
{
    const auto run_case = [](const InputElements& inputs, const SumcheckArrayOfValuesOverSubrelations& seed) {
        SumcheckArrayOfValuesOverSubrelations accumulator = seed;
        SumcheckArrayOfValuesOverSubrelations expected = seed;

        RelationParameters<FF> parameters;
        const FF gamma = FF::random_element();
        parameters.compute_multilinear_batching_challenges(gamma, NUM_CLAIMS);

        FF gamma_pow(1);
        for (size_t idx = 0; idx < NUM_CLAIMS; ++idx) {
            expected[0] += gamma_pow * inputs.non_shifted(idx) * inputs.eq(idx);
            expected[1] += gamma_pow * inputs.shifted(idx) * inputs.eq(idx);
            gamma_pow *= gamma;
        }

        Relation::accumulate(accumulator, inputs, parameters);

        EXPECT_EQ(accumulator, expected);
    };

    SumcheckArrayOfValuesOverSubrelations zero_seed{ FF(0), FF(0) };
    run_case(InputElements::special(), zero_seed);

    SumcheckArrayOfValuesOverSubrelations random_seed{ FF::random_element(), FF::random_element() };
    run_case(InputElements::random(), random_seed);
}

TEST_F(MultilinearBatchingRelationConsistency, SkipLogic)
{
    // Test case 1: every eq value is zero -> should skip
    InputElements zero_eq = InputElements::random();
    for (size_t idx = 0; idx < NUM_CLAIMS; ++idx) {
        zero_eq.eq_values[idx] = FF(0);
    }
    EXPECT_TRUE(Relation::skip(zero_eq));

    // Test case 2: every non_shifted and shifted value is zero -> should skip
    InputElements zero_witnesses = InputElements::random();
    for (size_t idx = 0; idx < NUM_CLAIMS; ++idx) {
        zero_witnesses.non_shifted_values[idx] = FF(0);
        zero_witnesses.shifted_values[idx] = FF(0);
    }
    EXPECT_TRUE(Relation::skip(zero_witnesses));

    // Test case 3: each slot contributes zero for a different reason -> should skip
    InputElements mixed_zero = InputElements::random();
    mixed_zero.eq_values[0] = FF(0);
    mixed_zero.non_shifted_values[1] = FF(0);
    mixed_zero.shifted_values[1] = FF(0);
    mixed_zero.non_shifted_values[2] = FF(0);
    mixed_zero.shifted_values[2] = FF(0);
    mixed_zero.eq_values[2] = FF(0);
    EXPECT_TRUE(Relation::skip(mixed_zero));

    // Test case 4: a single slot with non-zero non_shifted and non-zero eq -> should not skip
    InputElements non_shifted_active;
    non_shifted_active.non_shifted_values[NUM_CLAIMS - 1] = FF(1);
    non_shifted_active.eq_values[NUM_CLAIMS - 1] = FF(1);
    EXPECT_FALSE(Relation::skip(non_shifted_active));

    // Test case 5: a single slot with non-zero shifted and non-zero eq -> should not skip
    InputElements shifted_active;
    shifted_active.shifted_values[0] = FF(1);
    shifted_active.eq_values[0] = FF(1);
    EXPECT_FALSE(Relation::skip(shifted_active));

    // Test case 6: all values non-zero -> should not skip
    EXPECT_FALSE(Relation::skip(InputElements::special()));
}
