#include "barretenberg/proof_system/relations/fib_vm/fib_relation.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/proof_system/relations/baby_vm/baby_vm_row.hpp"
#include <gtest/gtest.h>

namespace proof_system::fib_vm_relation_tests {

using FF = barretenberg::fr;
using Row = fib_vm::FibRow<FF>;

constexpr size_t NUM_SUBRELATIONS = 4;

struct SubrelationValueAccumulatorsAndViews {
    using Accumulators = std::array<FF, NUM_SUBRELATIONS>;
    using AccumulatorViews = Accumulators;
};

class FibRelationTest : public testing::Test {
    // you can put shared test logic, aliases, utility function, etc in here.
};

TEST_F(FibRelationTest, Illustration)
{

    using Relation = fib_vm::FibRelation<FF>;
    using ArrayType = typename SubrelationValueAccumulatorsAndViews::Accumulators;
    static_assert(std::same_as<ArrayType, std::array<FF, NUM_SUBRELATIONS>>);
    const auto zero_out_array = [](ArrayType& arr) { std::fill(arr.begin(), arr.end(), 0); };

    // This is all subrelations
    ArrayType relation_value_accumulators;
    ArrayType zeroes;

    zero_out_array(relation_value_accumulators);
    zero_out_array(zeroes);

    [[maybe_unused]] const auto print_accumulators = [&]() {
        for (auto& subrelation_value_accumulator : relation_value_accumulators) {
            info(subrelation_value_accumulator);
        }
    };

    auto relation_parameters = RelationParameters<FF>::get_random();
    auto scaling_factor = FF::random_element();

    // TODO: remove maybe unused when tests are doen
    const auto check_one_row = [&](Row row, bool expect_eq) {
        Relation::template accumulate<SubrelationValueAccumulatorsAndViews>(
            relation_value_accumulators, row, relation_parameters, scaling_factor);
        if (expect_eq) {
            EXPECT_EQ(relation_value_accumulators, zeroes);

        } else {
            EXPECT_NE(relation_value_accumulators, zeroes);
            zero_out_array(relation_value_accumulators);
        }
    };

    // Here is an example of a series of valid rows

    // Create a valid row
    // The initial row, starting at 1, 1 in the sequence
    check_one_row(
        {
            .x = 1,
            .y = 1,
            .x_shift = 1,
            .y_shift = 2,
            .is_last = 0,
        },
        true);

    // Check an is last row
    check_one_row(
        {
            .x = 3,
            .y = 5,
            .x_shift = 1,
            .y_shift = 1,
            .is_last = 1,
        },
        true);
}
} // namespace proof_system::fib_vm_relation_tests