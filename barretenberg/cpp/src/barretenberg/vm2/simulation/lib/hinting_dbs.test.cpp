#include "barretenberg/vm2/simulation/lib/hinting_dbs.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/vm2/avm_api.hpp"
#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/simulation_helper.hpp"

#include <algorithm>
#include <cstddef>
#include <cstdlib>
#include <gtest/gtest.h>
#include <vector>

namespace bb::avm2::simulation {
namespace {

class HintingDBsTest : public ::testing::Test {
  protected:
    AvmProvingInputs inputs =
        AvmProvingInputs::from(read_file("../src/barretenberg/vm2/testing/minimal_tx.testdata.bin"));

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    static ExecutionHints dedupe_input_hints(const ExecutionHints& input_hints)
    {
        auto hint_values = [&]<typename K, typename V>(const unordered_flat_map<K, V>& mapped) -> std::vector<V> {
            std::vector<V> values;
            values.reserve(mapped.size());
            for (const auto& pair : mapped.values()) {
                values.push_back(pair.second);
            }
            return values;
        };

        unordered_flat_map<AztecAddress, ContractInstanceHint> input_instances;
        for (const auto& contract_instance_hint : input_hints.contractInstances) {
            input_instances[contract_instance_hint.address] = contract_instance_hint;
        }
        unordered_flat_map<AztecAddress, ContractClassHint> input_classes;
        for (const auto& contract_class_hint : input_hints.contractClasses) {
            input_classes[contract_class_hint.classId] = contract_class_hint;
        }
        unordered_flat_map<AztecAddress, BytecodeCommitmentHint> input_commitments;
        for (const auto& bytecode_commitment_hint : input_hints.bytecodeCommitments) {
            input_commitments[bytecode_commitment_hint.classId] = bytecode_commitment_hint;
        }

        unordered_flat_map<GetSiblingPathKey, GetSiblingPathHint> input_get_sibling_path_hints;
        for (const auto& get_sibling_path_hint : input_hints.getSiblingPathHints) {
            GetSiblingPathKey key = { get_sibling_path_hint.hintKey,
                                      get_sibling_path_hint.treeId,
                                      get_sibling_path_hint.index };
            input_get_sibling_path_hints[key] = get_sibling_path_hint;
        }
        unordered_flat_map<GetPreviousValueIndexKey, GetPreviousValueIndexHint> input_get_previous_value_index_hints;
        for (const auto& get_previous_value_index_hint : input_hints.getPreviousValueIndexHints) {
            GetPreviousValueIndexKey key = { get_previous_value_index_hint.hintKey,
                                             get_previous_value_index_hint.treeId,
                                             get_previous_value_index_hint.value };
            input_get_previous_value_index_hints[key] = get_previous_value_index_hint;
        }
        unordered_flat_map<GetLeafPreimageKey, GetLeafPreimageHint<IndexedLeaf<PublicDataLeafValue>>>
            input_get_leaf_preimage_hints_public_data_tree;
        for (const auto& get_leaf_preimage_hint : input_hints.getLeafPreimageHintsPublicDataTree) {
            GetLeafPreimageKey key = { get_leaf_preimage_hint.hintKey, get_leaf_preimage_hint.index };
            input_get_leaf_preimage_hints_public_data_tree[key] = get_leaf_preimage_hint;
        }
        unordered_flat_map<GetLeafPreimageKey, GetLeafPreimageHint<IndexedLeaf<NullifierLeafValue>>>
            input_get_leaf_preimage_hints_nullifier_tree;
        for (const auto& get_leaf_preimage_hint : input_hints.getLeafPreimageHintsNullifierTree) {
            GetLeafPreimageKey key = { get_leaf_preimage_hint.hintKey, get_leaf_preimage_hint.index };
            input_get_leaf_preimage_hints_nullifier_tree[key] = get_leaf_preimage_hint;
        }
        unordered_flat_map<GetLeafValueKey, GetLeafValueHint> input_get_leaf_value_hints;
        for (const auto& get_leaf_value_hint : input_hints.getLeafValueHints) {
            GetLeafValueKey key = { get_leaf_value_hint.hintKey,
                                    get_leaf_value_hint.treeId,
                                    get_leaf_value_hint.index };
            input_get_leaf_value_hints[key] = get_leaf_value_hint;
        }
        unordered_flat_map<SequentialInsertHintPublicDataTreeKey, SequentialInsertHint<PublicDataLeafValue>>
            input_sequential_insert_hints_public_data_tree;
        for (const auto& sequential_insert_hint : input_hints.sequentialInsertHintsPublicDataTree) {
            SequentialInsertHintPublicDataTreeKey key = { sequential_insert_hint.hintKey,
                                                          sequential_insert_hint.treeId,
                                                          sequential_insert_hint.leaf };
            input_sequential_insert_hints_public_data_tree[key] = sequential_insert_hint;
        }
        unordered_flat_map<SequentialInsertHintNullifierTreeKey, SequentialInsertHint<NullifierLeafValue>>
            input_sequential_insert_hints_nullifier_tree;
        for (const auto& sequential_insert_hint : input_hints.sequentialInsertHintsNullifierTree) {
            SequentialInsertHintNullifierTreeKey key = { sequential_insert_hint.hintKey,
                                                         sequential_insert_hint.treeId,
                                                         sequential_insert_hint.leaf };
            input_sequential_insert_hints_nullifier_tree[key] = sequential_insert_hint;
        }
        unordered_flat_map<AppendLeavesHintKey, AppendLeavesHint> input_append_leaves_hints;
        for (const auto& append_leaves_hint : input_hints.appendLeavesHints) {
            // Convert the span from the hint to a vector for the key
            AppendLeavesHintKey key = { append_leaves_hint.hintKey,
                                        append_leaves_hint.treeId,
                                        append_leaves_hint.leaves };
            input_append_leaves_hints[key] = append_leaves_hint;
        }
        unordered_flat_map</*action_counter*/ uint32_t, CreateCheckpointHint> input_create_checkpoint_hints;
        for (const auto& create_checkpoint_hint : input_hints.createCheckpointHints) {
            input_create_checkpoint_hints[create_checkpoint_hint.actionCounter] = create_checkpoint_hint;
        }
        unordered_flat_map</*action_counter*/ uint32_t, CommitCheckpointHint> input_commit_checkpoint_hints;
        for (const auto& commit_checkpoint_hint : input_hints.commitCheckpointHints) {
            input_commit_checkpoint_hints[commit_checkpoint_hint.actionCounter] = commit_checkpoint_hint;
        }
        unordered_flat_map</*action_counter*/ uint32_t, RevertCheckpointHint> input_revert_checkpoint_hints;
        for (const auto& revert_checkpoint_hint : input_hints.revertCheckpointHints) {
            input_revert_checkpoint_hints[revert_checkpoint_hint.actionCounter] = revert_checkpoint_hint;
        }

        return ExecutionHints{
            .globalVariables = input_hints.globalVariables,
            .tx = input_hints.tx,
            .protocolContracts = input_hints.protocolContracts,
            .contractInstances = hint_values(input_instances),
            .contractClasses = hint_values(input_classes),
            .bytecodeCommitments = hint_values(input_commitments),
            .startingTreeRoots = input_hints.startingTreeRoots,
            .getSiblingPathHints = hint_values(input_get_sibling_path_hints),
            .getPreviousValueIndexHints = hint_values(input_get_previous_value_index_hints),
            .getLeafPreimageHintsPublicDataTree = hint_values(input_get_leaf_preimage_hints_public_data_tree),
            .getLeafPreimageHintsNullifierTree = hint_values(input_get_leaf_preimage_hints_nullifier_tree),
            .getLeafValueHints = hint_values(input_get_leaf_value_hints),
            .sequentialInsertHintsPublicDataTree = hint_values(input_sequential_insert_hints_public_data_tree),
            .sequentialInsertHintsNullifierTree = hint_values(input_sequential_insert_hints_nullifier_tree),
            .appendLeavesHints = hint_values(input_append_leaves_hints),
            .createCheckpointHints = hint_values(input_create_checkpoint_hints),
            .commitCheckpointHints = hint_values(input_commit_checkpoint_hints),
            .revertCheckpointHints = hint_values(input_revert_checkpoint_hints),
        };
    }

    void compare_all_hints(const ExecutionHints& input_hints, const ExecutionHints& collected_hints)
    {
        compare_hints(input_hints.contractInstances, collected_hints.contractInstances);
        compare_hints(input_hints.contractClasses, collected_hints.contractClasses);
        compare_hints(input_hints.bytecodeCommitments, collected_hints.bytecodeCommitments);
        // TODO(MW): Bulk test inputs collect a single extra sibling path from a storage read c++ does not perform
        // (still proves without this hint):

        // compare_hints(input_hints.getSiblingPathHints, collected_hints.getSiblingPathHints);

        // TODO(MW): Behaviour discrepancy in checkContractUpdateInformation(): in c++ we do 3 unconstrained reads for
        // update_check (or not at all if the public mutable has never been updated), whereas in ts we always perform 3
        // reads => there are 3 additional unused hints:

        // compare_hints(input_hints.getPreviousValueIndexHints, collected_hints.getPreviousValueIndexHints);

        // TODO(MW): Due to above discrepancy, if any of the 3 reads need to access the tree they will create preimage
        // hints:

        // compare_hints(input_hints.getLeafPreimageHintsPublicDataTree,
        //               collected_hints.getLeafPreimageHintsPublicDataTree);

        compare_hints(input_hints.getLeafPreimageHintsNullifierTree, collected_hints.getLeafPreimageHintsNullifierTree);
        compare_hints(input_hints.getLeafValueHints, collected_hints.getLeafValueHints);
        compare_hints(input_hints.sequentialInsertHintsPublicDataTree,
                      collected_hints.sequentialInsertHintsPublicDataTree);
        compare_hints(input_hints.sequentialInsertHintsNullifierTree,
                      collected_hints.sequentialInsertHintsNullifierTree);
        compare_hints(input_hints.appendLeavesHints, collected_hints.appendLeavesHints);
        compare_hints(input_hints.createCheckpointHints, collected_hints.createCheckpointHints);
        compare_hints(input_hints.commitCheckpointHints, collected_hints.commitCheckpointHints);
        compare_hints(input_hints.revertCheckpointHints, collected_hints.revertCheckpointHints);
    }

    template <typename Hint>
    void compare_hints(const std::vector<Hint>& input_hints, const std::vector<Hint>& collected_hints)
    {
        // TODO(MW): Remove logs once testing complete
        // if (input_hints.size() != collected_hints.size()) {
        //     info("Hint size mismatch:", std::abs(int(input_hints.size() - collected_hints.size())));
        // }

        for (const Hint& input_hint : input_hints) {
            // TODO(MW): Remove logs once testing complete
            // if (std::find(collected_hints.begin(), collected_hints.end(), input_hint) == collected_hints.end()) {
            //     info("input hint not found in collected hints");
            //     info(input_hint);
            // }
            EXPECT_FALSE(std::find(collected_hints.begin(), collected_hints.end(), input_hint) ==
                         collected_hints.end());
        }

        // TODO(MW): Remove once testing complete - below checks for extra collected hints:
        // for (const Hint& collected_hint : collected_hints) {
        //     if (std::find(input_hints.begin(), input_hints.end(), collected_hint) == input_hints.end()) {
        //         info("collected hint not found in input hints");
        //         info(collected_hint);
        //     }
        // }
    }
};

TEST_F(HintingDBsTest, Basic)
{
    AvmSimulationHelper simulation_helper;
    TxSimulationResult result = simulation_helper.simulate_fast_with_real_dbs(inputs.hints);

    EXPECT_TRUE(result.execution_hints.has_value());
    auto collected_hints = result.execution_hints.value();
    auto input_hints = dedupe_input_hints(inputs.hints);

    compare_all_hints(input_hints, collected_hints);

    // Check proving works with collected hints:
    AvmProvingInputs inputs_with_collected_hints = inputs;
    AvmAPI api;
    inputs_with_collected_hints.hints = collected_hints;
    // Note: prove() call includes simulate_for_witgen() call with our collected hints:
    auto [proof, vk] = api.prove(inputs_with_collected_hints);
    EXPECT_TRUE(api.verify(proof, inputs_with_collected_hints.publicInputs, vk));
}

} // namespace
} // namespace bb::avm2::simulation
