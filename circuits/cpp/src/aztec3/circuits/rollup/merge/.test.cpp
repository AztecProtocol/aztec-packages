#include <gtest/gtest-death-test.h>
#include <gtest/gtest.h>
#include "aztec3/circuits/rollup/merge/init.hpp"
#include "aztec3/circuits/rollup/merge/utils.hpp"

namespace {
using aztec3::circuits::rollup::merge::utils::dummy_merge_rollup_inputs_with_vk_proof;
using aztec3::circuits::rollup::native_merge_rollup::BaseOrMergeRollupPublicInputs;
using aztec3::circuits::rollup::native_merge_rollup::merge_rollup_circuit;
using aztec3::circuits::rollup::native_merge_rollup::MergeRollupInputs;
using aztec3::circuits::rollup::native_merge_rollup::NT;

} // namespace
namespace aztec3::circuits::rollup::merge::native_merge_rollup_circuit {

class merge_rollup_tests : public ::testing::Test {};

#ifndef __wasm__ // TODO: temporary hack. WASM doesn't support EXPECT_DEATH or try/catch or EXPECT_THROW so no way to
                 // test these in wasm.
TEST_F(merge_rollup_tests, test_different_rollup_type_fails)
{
    auto mergeInput = dummy_merge_rollup_inputs_with_vk_proof();
    mergeInput.previous_rollup_data[0].base_or_merge_rollup_public_inputs.rollup_type = 0;
    mergeInput.previous_rollup_data[1].base_or_merge_rollup_public_inputs.rollup_type = 1;
    EXPECT_DEATH(merge_rollup_circuit(mergeInput), ".*assert_both_input_proofs_of_same_rollup_type.*");
}

TEST_F(merge_rollup_tests, test_different_rollup_height_fails)
{
    auto mergeInput = dummy_merge_rollup_inputs_with_vk_proof();
    mergeInput.previous_rollup_data[0].base_or_merge_rollup_public_inputs.rollup_subtree_height = 0;
    mergeInput.previous_rollup_data[1].base_or_merge_rollup_public_inputs.rollup_subtree_height = 1;
    EXPECT_DEATH(merge_rollup_circuit(mergeInput), ".*assert_both_input_proofs_of_same_height_and_return.*");
}

TEST_F(merge_rollup_tests, test_constants_different_failure)
{
    MergeRollupInputs inputs = dummy_merge_rollup_inputs_with_vk_proof();
    inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs.constants.public_kernel_vk_tree_root = fr(1);
    inputs.previous_rollup_data[1].base_or_merge_rollup_public_inputs.constants.public_kernel_vk_tree_root = fr(0);

    EXPECT_DEATH(merge_rollup_circuit(inputs), ".*assert_equal_constants.*");
}

TEST_F(merge_rollup_tests, test_fail_if_previous_rollups_dont_follow_on)
{
    MergeRollupInputs dummyInputs = dummy_merge_rollup_inputs_with_vk_proof();
    auto inputA = dummyInputs;
    inputA.previous_rollup_data[0].base_or_merge_rollup_public_inputs.end_private_data_tree_snapshot = {
        .root = fr(0), .next_available_leaf_index = 0
    };
    inputA.previous_rollup_data[1].base_or_merge_rollup_public_inputs.start_private_data_tree_snapshot = {
        .root = fr(1), .next_available_leaf_index = 0
    };

    EXPECT_DEATH(merge_rollup_circuit(inputA), ".*ensure_prev_rollups_follow_on_from_each_other.*");

    // do the same for nullifier tree
    auto inputB = dummyInputs;
    inputB.previous_rollup_data[0].base_or_merge_rollup_public_inputs.end_nullifier_tree_snapshot = {
        .root = fr(0), .next_available_leaf_index = 0
    };
    inputB.previous_rollup_data[1].base_or_merge_rollup_public_inputs.start_nullifier_tree_snapshot = {
        .root = fr(1), .next_available_leaf_index = 0
    };
    EXPECT_DEATH(merge_rollup_circuit(inputB), ".*ensure_prev_rollups_follow_on_from_each_other.*");

    // do the same for contract tree
    auto inputC = dummyInputs;
    inputC.previous_rollup_data[0].base_or_merge_rollup_public_inputs.end_contract_tree_snapshot = {
        .root = fr(0), .next_available_leaf_index = 0
    };
    inputC.previous_rollup_data[1].base_or_merge_rollup_public_inputs.start_contract_tree_snapshot = {
        .root = fr(1), .next_available_leaf_index = 0
    };
    EXPECT_DEATH(merge_rollup_circuit(inputC), ".*ensure_prev_rollups_follow_on_from_each_other.*");
}
#endif

TEST_F(merge_rollup_tests, test_rollup_fields_are_set_correctly)
{
    MergeRollupInputs inputs = dummy_merge_rollup_inputs_with_vk_proof();
    BaseOrMergeRollupPublicInputs outputs = merge_rollup_circuit(inputs);
    // check that rollup type is set to merge
    ASSERT_EQ(outputs.rollup_type, 1);
    // check that rollup height is incremented
    ASSERT_EQ(outputs.rollup_subtree_height,
              inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs.rollup_subtree_height + 1);

    // set inputs to have a merge rollup type and set the rollup height and test again.
    inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs.rollup_type = 1;
    inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs.rollup_subtree_height = 1;

    inputs.previous_rollup_data[1].base_or_merge_rollup_public_inputs.rollup_type = 1;
    inputs.previous_rollup_data[1].base_or_merge_rollup_public_inputs.rollup_subtree_height = 1;

    outputs = merge_rollup_circuit(inputs);
    ASSERT_EQ(outputs.rollup_type, 1);
    ASSERT_EQ(outputs.rollup_subtree_height, 2);
}

TEST_F(merge_rollup_tests, test_start_and_end_snapshots)
{
    MergeRollupInputs inputs = dummy_merge_rollup_inputs_with_vk_proof();
    BaseOrMergeRollupPublicInputs outputs = merge_rollup_circuit(inputs);
    // check that start and end snapshots are set correctly
    ASSERT_EQ(outputs.start_private_data_tree_snapshot,
              inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs.start_private_data_tree_snapshot);
    ASSERT_EQ(outputs.end_private_data_tree_snapshot,
              inputs.previous_rollup_data[1].base_or_merge_rollup_public_inputs.end_private_data_tree_snapshot);

    ASSERT_EQ(outputs.start_nullifier_tree_snapshot,
              inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs.start_nullifier_tree_snapshot);
    ASSERT_EQ(outputs.end_nullifier_tree_snapshot,
              inputs.previous_rollup_data[1].base_or_merge_rollup_public_inputs.end_nullifier_tree_snapshot);

    ASSERT_EQ(outputs.start_contract_tree_snapshot,
              inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs.start_contract_tree_snapshot);
    ASSERT_EQ(outputs.end_contract_tree_snapshot,
              inputs.previous_rollup_data[1].base_or_merge_rollup_public_inputs.end_contract_tree_snapshot);
}

TEST_F(merge_rollup_tests, test_calldata_hash)
{
    std::vector<uint8_t> zero_bytes_vec(704, 0);
    auto call_data_hash_inner = sha256::sha256(zero_bytes_vec);

    std::array<uint8_t, 64> hash_input;
    for (uint8_t i = 0; i < 32; ++i) {
        hash_input[i] = call_data_hash_inner[i];
        hash_input[32 + i] = call_data_hash_inner[i];
    }

    std::vector<uint8_t> calldata_hash_input_bytes_vec(hash_input.begin(), hash_input.end());

    auto expected_calldata_hash = sha256::sha256(calldata_hash_input_bytes_vec);

    MergeRollupInputs inputs = dummy_merge_rollup_inputs_with_vk_proof();
    BaseOrMergeRollupPublicInputs outputs = merge_rollup_circuit(inputs);

    std::array<fr, 2> actual_calldata_hash_fr = outputs.calldata_hash;
    auto high_buffer = actual_calldata_hash_fr[0].to_buffer();
    auto low_buffer = actual_calldata_hash_fr[1].to_buffer();

    std::array<uint8_t, 32> actual_calldata_hash;
    for (uint8_t i = 0; i < 16; ++i) {
        actual_calldata_hash[i] = high_buffer[16 + i];
        actual_calldata_hash[16 + i] = low_buffer[16 + i];
    }

    ASSERT_EQ(expected_calldata_hash, actual_calldata_hash);
}

TEST_F(merge_rollup_tests, test_constants_dont_change)
{
    MergeRollupInputs inputs = dummy_merge_rollup_inputs_with_vk_proof();
    BaseOrMergeRollupPublicInputs outputs = merge_rollup_circuit(inputs);
    ASSERT_EQ(inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs.constants, outputs.constants);
    ASSERT_EQ(inputs.previous_rollup_data[1].base_or_merge_rollup_public_inputs.constants, outputs.constants);
}

TEST_F(merge_rollup_tests, test_aggregate)
{
    // TODO: Fix this when aggregation works
    MergeRollupInputs inputs = dummy_merge_rollup_inputs_with_vk_proof();
    BaseOrMergeRollupPublicInputs outputs = merge_rollup_circuit(inputs);
    ASSERT_EQ(inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs.end_aggregation_object.public_inputs,
              outputs.end_aggregation_object.public_inputs);
}
} // namespace aztec3::circuits::rollup::merge::native_merge_rollup_circuit
