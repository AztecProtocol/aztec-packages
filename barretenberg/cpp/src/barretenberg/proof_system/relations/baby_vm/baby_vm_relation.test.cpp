#include "barretenberg/proof_system/relations/baby_vm/baby_vm_relation.hpp"
#include "barretenberg/proof_system/relations/baby_vm/baby_vm_row.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <gtest/gtest.h>

namespace proof_system::baby_vm_relation_tests {

using FF = barretenberg::fr;
using Row = BabyVMRow<FF>;

constexpr size_t NUM_SUBRELATIONS = 5;

struct SubrelationValueAccumulatorsAndViews {
    using Accumulators = std::array<FF, NUM_SUBRELATIONS>;
    using AccumulatorViews = Accumulators;
};


class BabyVMRelationTest : public testing::Test {
    // you can put shared test logic, aliases, utility function, etc in here.
};

TEST_F(BabyVMRelationTest, Basic)
{
    using Relation = BabyVMRelation<FF>;
    using ArrayType = typename SubrelationValueAccumulatorsAndViews::Accumulators;
    static_assert(std::same_as<ArrayType, std::array<FF, NUM_SUBRELATIONS>>);
    const auto zero_out_array = [](ArrayType& arr) { std::fill(arr.begin(), arr.end(), 0); };

    ArrayType accumulators;
    ArrayType zeroes;

    zero_out_array(accumulators);
    zero_out_array(zeroes);

    [[maybe_unused]] const auto print_accumulators = [&]() {
        for (auto& subrelation_accumulator : accumulators) {
            info(subrelation_accumulator);
        }
    };

    auto relation_parameters = RelationParameters<FF>::get_random();
    auto scaling_factor = FF::random_element();

    // A row is valid if and only if all protocol relations (here there is one) and all of its subrelations (here there
    // are several) evaluate to 0 on it.
    const auto check_one_row = [&](Row row, bool expect_eq) {
        Relation::template accumulate<SubrelationValueAccumulatorsAndViews>(
            accumulators, row, relation_parameters, scaling_factor);
        if (expect_eq) {
            EXPECT_EQ(accumulators, zeroes);
        } else {
            EXPECT_NE(accumulators, zeroes);
            zero_out_array(accumulators);
        }
    };

    // valid row: both selectors are 0
    // Question for designer: should this be valid?
    check_one_row({ .w_l = FF::random_element(),
                    .w_r = FF::random_element(),
                    .w_o = FF::random_element(),
                    .q_mul = 0,
                    .q_add = 0 },
                  /*expect_eq=*/true);

    // invalid row: q_mul is not boolean
    check_one_row({ .w_l = FF::random_element(),
                    .w_r = FF::random_element(),
                    .w_o = FF::random_element(),
                    .q_mul = 2,
                    .q_add = 0 },
                  /*expect_eq=*/false);

    // invalid row: both instructions are active
    // Question for designer: maybe you _want_ the situation where both selectors are 1 to correspond to some totally
    // new kind of behavior?
    check_one_row({ .w_l = FF::random_element(),
                    .w_r = FF::random_element(),
                    .w_o = FF::random_element(),
                    .q_mul = 1,
                    .q_add = 1 },
                  /*expect_eq=*/false);

    // valid row: 2 * 3 == 6
    check_one_row({ .w_l = 2, .w_r = 3, .w_o = 6, .q_mul = 1, .q_add = 0 },
                  /*expect_eq=*/true);

    // valid row: 2 + 3 == 5
    check_one_row({ .w_l = 2, .w_r = 3, .w_o = 5, .q_mul = 0, .q_add = 1 },
                  /*expect_eq=*/true);

    // invalid row: q_add is not boolean
    check_one_row({ .w_l = FF::random_element(),
                    .w_r = FF::random_element(),
                    .w_o = FF::random_element(),
                    .q_mul = 0,
                    .q_add = -FF(1) },
                  /*expect_eq=*/false);

    // invalid row: 2 * 3 != 23
    check_one_row({ .w_l = 2, .w_r = 3, .w_o = 23, .q_mul = 1, .q_add = 0 },
                  /*expect_eq=*/false);
};

} // namespace proof_system::baby_vm_relation_tests
