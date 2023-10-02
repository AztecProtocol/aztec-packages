#include "barretenberg/proof_system/relations/baby_vm/baby_vm_relation.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/proof_system/relations/baby_vm/baby_vm_row.hpp"
#include <gtest/gtest.h>

namespace proof_system::baby_vm_relation_tests {

using FF = barretenberg::fr;
using Row = BabyVMRow<FF>;

constexpr size_t NUM_SUBRELATIONS = 5;

// EXERCISE NOTE: This class is normally defined generically, but I put it here for two reasons:
// 1) clarity; 2) I'm going to refactor the relations classes to be simpler and get rid of the need for this.
struct SubrelationValueAccumulatorsAndViews {
    using Accumulators = std::array<FF, NUM_SUBRELATIONS>;
    using AccumulatorViews = Accumulators;
};

class BabyVMRelationTest : public testing::Test {
    // you can put shared test logic, aliases, utility function, etc in here.
};

TEST_F(BabyVMRelationTest, Illustration)
{
    using Relation = BabyVMRelation<FF>;
    using ArrayType = typename SubrelationValueAccumulatorsAndViews::Accumulators;
    static_assert(std::same_as<ArrayType, std::array<FF, NUM_SUBRELATIONS>>);
    const auto zero_out_array = [](ArrayType& arr) { std::fill(arr.begin(), arr.end(), 0); };

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

    // A row is valid if and only if all protocol relations (here there is one) and all of its subrelations (here there
    // are several) evaluate to 0 on it.
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

    // invalid row: q_mul is not boolean
    check_one_row({ .scalar = FF::random_element(),
                    .q_mul = 2,
                    .q_add = 0,
                    .accumulator = FF::random_element(),
                    .previous_accumulator = FF::random_element() },
                  /*expect_eq=*/false);

    // invalid row: q_add is not boolean
    check_one_row({ .scalar = FF::random_element(),
                    .q_mul = 0,
                    .q_add = -FF(1),
                    .accumulator = FF::random_element(),
                    .previous_accumulator = FF::random_element() },
                  /*expect_eq=*/false);

    // valid row: 2 * 3 == 6
    check_one_row({ .scalar = 2, .q_mul = 1, .q_add = 0, .accumulator = 6, .previous_accumulator = 3 },
                  /*expect_eq=*/true);

    // invalid row: 2 * 3 != 23
    check_one_row({ .scalar = 2, .q_mul = 1, .q_add = 0, .accumulator = 23, .previous_accumulator = 3 },
                  /*expect_eq=*/false);

    // valid row: 2 + 3 == 5
    check_one_row({ .scalar = 2, .q_mul = 0, .q_add = 1, .accumulator = 5, .previous_accumulator = 3 },
                  /*expect_eq=*/true);

    // invalid row: 2 + 3 != 23
    check_one_row({ .scalar = 2, .q_mul = 0, .q_add = 1, .accumulator = 23, .previous_accumulator = 3 },
                  /*expect_eq=*/false);

    // valid row: 2 == 2
    check_one_row(
        { .scalar = 2, .q_mul = 0, .q_add = 0, .accumulator = 2, .previous_accumulator = FF::random_element() },
        /*expect_eq=*/true);

    // invalid row: 2 != 23
    check_one_row(
        { .scalar = 2, .q_mul = 0, .q_add = 0, .accumulator = 23, .previous_accumulator = FF::random_element() },
        /*expect_eq=*/false);

    // Valid row: both selectors are 1
    // EXERCISE NOTE: Question for designer: should this be valid?
    check_one_row({ .scalar = FF::random_element(),
                    .q_mul = 1,
                    .q_add = 1,
                    .accumulator = FF::random_element(),
                    .previous_accumulator = FF::random_element() },
                  /*expect_eq=*/true);
}
} // namespace proof_system::baby_vm_relation_tests
