#include "barretenberg/vm2/simulation/lib/hinting_dbs.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/vm2/avm_api.hpp"
#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/lib/raw_data_dbs.hpp"
#include "barretenberg/vm2/simulation/testing/mock_dbs.hpp"
#include "barretenberg/vm2/simulation_helper.hpp"

#include "gmock/gmock.h"
#include <algorithm>
#include <cstddef>
#include <cstdlib>
#include <gtest/gtest.h>
#include <vector>

namespace bb::avm2::simulation {
namespace {

class HintingDBsTest : public ::testing::Test {
  protected:
    HintingDBsTest(const AvmProvingInputs& inputs)
        : inputs(inputs)
        , base_contract_db(HintedRawContractDB(inputs.hints))
        , base_merkle_db(HintedRawMerkleDB(inputs.hints))
    {
        bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    }

    // TODO(MW): delete once testing complete
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

        unordered_flat_map<GetContractInstanceKey, ContractInstanceHint> input_instances;
        for (const auto& contract_instance_hint : input_hints.contractInstances) {
            GetContractInstanceKey key = { contract_instance_hint.hintKey, contract_instance_hint.address };
            input_instances[key] = contract_instance_hint;
        }
        unordered_flat_map<GetContractClassKey, ContractClassHint> input_classes;
        for (const auto& contract_class_hint : input_hints.contractClasses) {
            GetContractClassKey key = { contract_class_hint.hintKey, contract_class_hint.classId };
            input_classes[key] = contract_class_hint;
        }
        unordered_flat_map<GetBytecodeCommitmentKey, BytecodeCommitmentHint> input_commitments;
        for (const auto& bytecode_commitment_hint : input_hints.bytecodeCommitments) {
            GetBytecodeCommitmentKey key = { bytecode_commitment_hint.hintKey, bytecode_commitment_hint.classId };
            input_commitments[key] = bytecode_commitment_hint;
        }
        unordered_flat_map<GetDebugFunctionNameKey, DebugFunctionNameHint> debug_function_names;
        for (const auto& debug_function_name_hint : input_hints.debugFunctionNames) {
            GetDebugFunctionNameKey key = { debug_function_name_hint.address, debug_function_name_hint.selector };
            debug_function_names[key] = debug_function_name_hint;
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
        unordered_flat_map</*action_counter*/ uint32_t, ContractDBCreateCheckpointHint>
            input_contract_create_checkpoint_hints;
        for (const auto& create_checkpoint_hint : input_hints.contractDBCreateCheckpointHints) {
            input_contract_create_checkpoint_hints[create_checkpoint_hint.actionCounter] = create_checkpoint_hint;
        }
        unordered_flat_map</*action_counter*/ uint32_t, ContractDBCommitCheckpointHint>
            input_contract_commit_checkpoint_hints;
        for (const auto& commit_checkpoint_hint : input_hints.contractDBCommitCheckpointHints) {
            input_contract_commit_checkpoint_hints[commit_checkpoint_hint.actionCounter] = commit_checkpoint_hint;
        }
        unordered_flat_map</*action_counter*/ uint32_t, ContractDBRevertCheckpointHint>
            input_contract_revert_checkpoint_hints;
        for (const auto& revert_checkpoint_hint : input_hints.contractDBRevertCheckpointHints) {
            input_contract_revert_checkpoint_hints[revert_checkpoint_hint.actionCounter] = revert_checkpoint_hint;
        }

        return ExecutionHints{
            .globalVariables = input_hints.globalVariables,
            .tx = input_hints.tx,
            .protocolContracts = input_hints.protocolContracts,
            .contractInstances = hint_values(input_instances),
            .contractClasses = hint_values(input_classes),
            .bytecodeCommitments = hint_values(input_commitments),
            .debugFunctionNames = hint_values(debug_function_names),
            .contractDBCreateCheckpointHints = hint_values(input_contract_create_checkpoint_hints),
            .contractDBCommitCheckpointHints = hint_values(input_contract_commit_checkpoint_hints),
            .contractDBRevertCheckpointHints = hint_values(input_contract_revert_checkpoint_hints),
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
        // TODO(MW): Behaviour discrepancy for protocol contracts - in ts we call getPublicFunctionDebugName which
        // collects hints for the external contracts, but in c++ we do not (and proving passes without these hints):
        // compare_hints(input_hints.debugFunctionNames, collected_hints.debugFunctionNames);
        compare_hints(input_hints.contractDBCreateCheckpointHints, collected_hints.contractDBCreateCheckpointHints);
        compare_hints(input_hints.contractDBCommitCheckpointHints, collected_hints.contractDBCommitCheckpointHints);
        compare_hints(input_hints.contractDBRevertCheckpointHints, collected_hints.contractDBRevertCheckpointHints);
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
            EXPECT_FALSE(std::ranges::find(collected_hints.begin(), collected_hints.end(), input_hint) ==
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

  public:
    AvmProvingInputs inputs;
    HintedRawContractDB base_contract_db;
    HintedRawMerkleDB base_merkle_db;
    HintingContractsDB hinting_contract_db = HintingContractsDB(base_contract_db);
    HintingRawDB hinting_merkle_db = HintingRawDB(base_merkle_db);
};

class HintingDBsMinimalTest : public HintingDBsTest {
  protected:
    HintingDBsMinimalTest()
        : HintingDBsTest(AvmProvingInputs::from(read_file("../src/barretenberg/vm2/testing/minimal_tx.testdata.bin")))
    {}
};

AvmProvingInputs fix_action_counters(AvmProvingInputs inputs)
{

    auto reset_action_counters = [&]<typename H>(std::vector<H>& hints) {
        for (auto& hint : hints) {
            hint.hintKey = 0;
        }
    };

    auto reset_tree_id = [&]<typename H>(std::vector<H>& hints) {
        for (auto& hint : hints) {
            hint.treeId = MerkleTreeId(hint.treeId % 4);
            hint.hintKey = get_tree_info_helper(hint.treeId, inputs.hints.startingTreeRoots);
        }
    };
    reset_action_counters(inputs.hints.contractInstances);
    reset_action_counters(inputs.hints.contractClasses);
    reset_action_counters(inputs.hints.bytecodeCommitments);
    reset_tree_id(inputs.hints.getSiblingPathHints);

    return inputs;
};

AvmProvingInputs avm_inputs_testdata =
    fix_action_counters(AvmProvingInputs::from(read_file("../src/barretenberg/vm2/testing/avm_inputs.testdata.bin")));

class HintingDBsTestInputTest : public HintingDBsTest {
  protected:
    HintingDBsTestInputTest()
        : HintingDBsTest(avm_inputs_testdata)
    {}
};

TEST_F(HintingDBsMinimalTest, Basic)
{
    AvmSimulationHelper simulation_helper;
    TxSimulationResult result = simulation_helper.simulate_fast_with_hinting_dbs(base_contract_db,
                                                                                 base_merkle_db,
                                                                                 inputs.hints.tx,
                                                                                 inputs.hints.globalVariables,
                                                                                 inputs.hints.protocolContracts);

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

TEST_F(HintingDBsTestInputTest, GetContractInstance)
{
    for (const auto& instance_hint : inputs.hints.contractInstances) {
        auto instance = hinting_contract_db.get_contract_instance(instance_hint.address);
        EXPECT_TRUE(instance.has_value());
        // TODO(MW): Check equality works for classes:
        EXPECT_EQ(instance.value(), base_contract_db.get_contract_instance(instance_hint.address).value());
    }

    ExecutionHints collected_hints;
    hinting_contract_db.dump_hints(collected_hints);
    compare_hints(inputs.hints.contractInstances, collected_hints.contractInstances);
}

TEST_F(HintingDBsTestInputTest, GetContractClass)
{
    for (const auto& class_hint : inputs.hints.contractClasses) {
        auto klass = hinting_contract_db.get_contract_class(class_hint.classId);
        EXPECT_TRUE(klass.has_value());
        // TODO(MW): Check equality works for classes:
        EXPECT_EQ(klass.value(), base_contract_db.get_contract_class(class_hint.classId).value());
    }

    ExecutionHints collected_hints;
    hinting_contract_db.dump_hints(collected_hints);
    compare_hints(inputs.hints.contractClasses, collected_hints.contractClasses);
}

TEST_F(HintingDBsTestInputTest, GetBytecodeCommitment)
{
    for (const auto& hint : inputs.hints.bytecodeCommitments) {
        auto commitment = hinting_contract_db.get_bytecode_commitment(hint.classId);
        EXPECT_TRUE(commitment.has_value());
        EXPECT_EQ(commitment.value(), base_contract_db.get_bytecode_commitment(hint.classId).value());
    }

    ExecutionHints collected_hints;
    hinting_contract_db.dump_hints(collected_hints);
    compare_hints(inputs.hints.bytecodeCommitments, collected_hints.bytecodeCommitments);
}

TEST_F(HintingDBsTestInputTest, GetDebugFunctionName)
{
    for (const auto& hint : inputs.hints.debugFunctionNames) {
        auto name = hinting_contract_db.get_debug_function_name(hint.address, hint.selector);
        EXPECT_TRUE(name.has_value());
        EXPECT_EQ(name.value(), base_contract_db.get_debug_function_name(hint.address, hint.selector).value());
    }

    ExecutionHints collected_hints;
    hinting_contract_db.dump_hints(collected_hints);
    compare_hints(inputs.hints.debugFunctionNames, collected_hints.debugFunctionNames);
}

TEST_F(HintingDBsMinimalTest, ContractDBCheckpoints)
{
    // The minimal tx has one create and one commit. The conditionals are in case the minimal tx ever changes, bricking
    // this test:
    if (inputs.hints.contractDBCreateCheckpointHints.size() == 1) {
        // The hinting db will cause the underlying base db to push a checkpoint onto the stack and increment the action
        // counter:
        hinting_contract_db.create_checkpoint();
        if (inputs.hints.contractDBCommitCheckpointHints.size() == 1) {
            hinting_contract_db.commit_checkpoint();
        }
    }
    ExecutionHints collected_hints;
    hinting_contract_db.dump_hints(collected_hints);
    compare_hints(inputs.hints.contractDBCreateCheckpointHints, collected_hints.contractDBCreateCheckpointHints);
    compare_hints(inputs.hints.contractDBCommitCheckpointHints, collected_hints.contractDBCommitCheckpointHints);
}

TEST_F(HintingDBsTestInputTest, GetSiblingPath)
{
    for (const auto& hint : inputs.hints.getSiblingPathHints) {
        auto path = hinting_merkle_db.get_sibling_path(hint.treeId, hint.index);
        EXPECT_EQ(path, base_merkle_db.get_sibling_path(hint.treeId, hint.index));
    }

    ExecutionHints collected_hints;
    hinting_merkle_db.dump_hints(collected_hints);
    compare_hints(inputs.hints.getSiblingPathHints, collected_hints.getSiblingPathHints);
}

TEST_F(HintingDBsMinimalTest, MerkleDBCheckpoints)
{
    // The minimal tx has one create and one commit. The conditionals are in case the minimal tx ever changes, bricking
    // this test:
    if (inputs.hints.createCheckpointHints.size() == 1) {
        // The hinting db will cause the underlying base db to push a checkpoint onto the stack and increment the action
        // counter:
        hinting_merkle_db.create_checkpoint();
        if (inputs.hints.commitCheckpointHints.size() == 1) {
            hinting_merkle_db.commit_checkpoint();
        }
    }
    ExecutionHints collected_hints;
    hinting_merkle_db.dump_hints(collected_hints);
    compare_hints(inputs.hints.createCheckpointHints, collected_hints.createCheckpointHints);
    compare_hints(inputs.hints.commitCheckpointHints, collected_hints.commitCheckpointHints);
}

class MockedHintingDBsTest : public ::testing::Test {
  protected:
    MockedHintingDBsTest() { ON_CALL(base_merkle_db, get_tree_roots).WillByDefault(testing::Return(mock_tree_info)); }
    testing::StrictMock<MockContractDB> base_contract_db;
    testing::StrictMock<MockLowLevelMerkleDB> base_merkle_db;
    HintingContractsDB hinting_contract_db = HintingContractsDB(base_contract_db);
    HintingRawDB hinting_merkle_db = HintingRawDB(base_merkle_db);

    TreeSnapshots mock_tree_info = {
        { 1, 2 },
        { 3, 2 },
        { 5, 5 },
        { 7, 3 },
    };
};

TEST_F(MockedHintingDBsTest, GetLowLeaf)
{
    // Mock some slots:
    std::vector<FF> update_preimage_slots = { 1, 2, 4 };
    SiblingPath mock_path((PUBLIC_DATA_TREE_HEIGHT));
    // get_low_indexed_leaf will call get_tree_roots and get_sibling_path (which itself will call get_tree_roots):
    EXPECT_CALL(base_merkle_db, get_tree_roots).Times(static_cast<int>(update_preimage_slots.size() * 2));
    EXPECT_CALL(base_merkle_db, get_sibling_path(world_state::MerkleTreeId::PUBLIC_DATA_TREE, testing::_))
        .WillRepeatedly([&](world_state::MerkleTreeId, index_t) { return mock_path; });
    EXPECT_CALL(base_merkle_db, get_low_indexed_leaf(world_state::MerkleTreeId::PUBLIC_DATA_TREE, testing::_))
        .WillRepeatedly([&](world_state::MerkleTreeId, const FF& leaf_slot) {
            for (size_t i = 0; i < update_preimage_slots.size(); ++i) {
                if (leaf_slot == update_preimage_slots[i]) {
                    return GetLowIndexedLeafResponse(true, static_cast<uint64_t>(i));
                }
            }
            throw std::runtime_error("Leaf not found");
        });

    // Call the db:
    for (const auto& update_preimage_slot : update_preimage_slots) {
        hinting_merkle_db.get_low_indexed_leaf(world_state::MerkleTreeId::PUBLIC_DATA_TREE, update_preimage_slot);
    }
    ExecutionHints collected_hints;
    hinting_merkle_db.dump_hints(collected_hints);

    // Check the collected hints:
    EXPECT_EQ(collected_hints.getPreviousValueIndexHints.size(), update_preimage_slots.size());
    EXPECT_THAT(
        collected_hints.getPreviousValueIndexHints,
        testing::ElementsAreArray({ GetPreviousValueIndexHint{ .hintKey = mock_tree_info.publicDataTree,
                                                               .treeId = world_state::MerkleTreeId::PUBLIC_DATA_TREE,
                                                               .value = update_preimage_slots[0],
                                                               .index = 0,
                                                               .alreadyPresent = true },
                                    GetPreviousValueIndexHint{ .hintKey = mock_tree_info.publicDataTree,
                                                               .treeId = world_state::MerkleTreeId::PUBLIC_DATA_TREE,
                                                               .value = update_preimage_slots[1],
                                                               .index = 1,
                                                               .alreadyPresent = true },
                                    GetPreviousValueIndexHint{ .hintKey = mock_tree_info.publicDataTree,
                                                               .treeId = world_state::MerkleTreeId::PUBLIC_DATA_TREE,
                                                               .value = update_preimage_slots[2],
                                                               .index = 2,
                                                               .alreadyPresent = true } }));
    EXPECT_THAT(collected_hints.getSiblingPathHints,
                testing::ElementsAreArray({ GetSiblingPathHint{ .hintKey = mock_tree_info.publicDataTree,
                                                                .treeId = world_state::MerkleTreeId::PUBLIC_DATA_TREE,
                                                                .index = 0,
                                                                .path = mock_path },
                                            GetSiblingPathHint{ .hintKey = mock_tree_info.publicDataTree,
                                                                .treeId = world_state::MerkleTreeId::PUBLIC_DATA_TREE,
                                                                .index = 1,
                                                                .path = mock_path },
                                            GetSiblingPathHint{ .hintKey = mock_tree_info.publicDataTree,
                                                                .treeId = world_state::MerkleTreeId::PUBLIC_DATA_TREE,
                                                                .index = 2,
                                                                .path = mock_path } }));
}

TEST_F(MockedHintingDBsTest, GetLeafValue)
{
    // Mock some leaf values:
    std::vector<FF> note_hash_leaf_values = { 11, 22, 44, 88 };
    SiblingPath mock_path((NOTE_HASH_TREE_HEIGHT));
    // get_leaf_value will call get_tree_roots and get_sibling_path (which itself will call get_tree_roots):
    EXPECT_CALL(base_merkle_db, get_tree_roots).Times(static_cast<int>(note_hash_leaf_values.size() * 2));
    EXPECT_CALL(base_merkle_db, get_sibling_path(world_state::MerkleTreeId::NOTE_HASH_TREE, testing::_))
        .WillRepeatedly([&](world_state::MerkleTreeId, index_t) { return mock_path; });
    EXPECT_CALL(base_merkle_db, get_leaf_value(world_state::MerkleTreeId::NOTE_HASH_TREE, testing::_))
        .WillRepeatedly([&](world_state::MerkleTreeId, index_t index) {
            if (index < note_hash_leaf_values.size()) {
                return note_hash_leaf_values[index];
            }
            throw std::runtime_error("Leaf not found");
        });

    // Call the db:
    for (index_t i = 0; i < note_hash_leaf_values.size(); i++) {
        hinting_merkle_db.get_leaf_value(world_state::MerkleTreeId::NOTE_HASH_TREE, i);
    }
    ExecutionHints collected_hints;
    hinting_merkle_db.dump_hints(collected_hints);

    // Check the collected hints:
    EXPECT_EQ(collected_hints.getLeafValueHints.size(), note_hash_leaf_values.size());
    EXPECT_THAT(collected_hints.getLeafValueHints,
                testing::ElementsAreArray({
                    GetLeafValueHint{ .hintKey = mock_tree_info.noteHashTree,
                                      .treeId = world_state::MerkleTreeId::NOTE_HASH_TREE,
                                      .index = 0,
                                      .value = note_hash_leaf_values[0] },
                    GetLeafValueHint{ .hintKey = mock_tree_info.noteHashTree,
                                      .treeId = world_state::MerkleTreeId::NOTE_HASH_TREE,
                                      .index = 1,
                                      .value = note_hash_leaf_values[1] },
                    GetLeafValueHint{ .hintKey = mock_tree_info.noteHashTree,
                                      .treeId = world_state::MerkleTreeId::NOTE_HASH_TREE,
                                      .index = 2,
                                      .value = note_hash_leaf_values[2] },
                    GetLeafValueHint{ .hintKey = mock_tree_info.noteHashTree,
                                      .treeId = world_state::MerkleTreeId::NOTE_HASH_TREE,
                                      .index = 3,
                                      .value = note_hash_leaf_values[3] },
                }));
    EXPECT_THAT(collected_hints.getSiblingPathHints,
                testing::ElementsAreArray({ GetSiblingPathHint{ .hintKey = mock_tree_info.noteHashTree,
                                                                .treeId = world_state::MerkleTreeId::NOTE_HASH_TREE,
                                                                .index = 0,
                                                                .path = mock_path },
                                            GetSiblingPathHint{ .hintKey = mock_tree_info.noteHashTree,
                                                                .treeId = world_state::MerkleTreeId::NOTE_HASH_TREE,
                                                                .index = 1,
                                                                .path = mock_path },
                                            GetSiblingPathHint{ .hintKey = mock_tree_info.noteHashTree,
                                                                .treeId = world_state::MerkleTreeId::NOTE_HASH_TREE,
                                                                .index = 2,
                                                                .path = mock_path },
                                            GetSiblingPathHint{ .hintKey = mock_tree_info.noteHashTree,
                                                                .treeId = world_state::MerkleTreeId::NOTE_HASH_TREE,
                                                                .index = 3,
                                                                .path = mock_path } }));
}

TEST_F(MockedHintingDBsTest, GetLeafPreimagePublicDataTree)
{
    // Mock some leaf values:
    std::vector<PublicDataLeafValue> public_leaf_values = { { 1, 3 }, { 2, 6 }, { 4, 7 } };
    std::vector<IndexedLeaf<PublicDataLeafValue>> public_leaf_preimages = { { public_leaf_values[0], 1, 6 },
                                                                            { public_leaf_values[1], 2, 4 },
                                                                            { public_leaf_values[2], 0, 3 } };
    SiblingPath mock_path((PUBLIC_DATA_TREE_HEIGHT));
    // get_leaf_preimage_public_data_tree will call get_tree_roots and get_sibling_path (which itself will call
    // get_tree_roots):
    EXPECT_CALL(base_merkle_db, get_tree_roots).Times(static_cast<int>(public_leaf_preimages.size() * 2));
    EXPECT_CALL(base_merkle_db, get_sibling_path(world_state::MerkleTreeId::PUBLIC_DATA_TREE, testing::_))
        .WillRepeatedly([&](world_state::MerkleTreeId, index_t) { return mock_path; });
    EXPECT_CALL(base_merkle_db, get_leaf_preimage_public_data_tree(testing::_)).WillRepeatedly([&](index_t index) {
        if (index < public_leaf_preimages.size()) {
            return public_leaf_preimages[index];
        }
        throw std::runtime_error("Leaf preimage not found");
    });

    // Call the db:
    for (index_t i = 0; i < public_leaf_preimages.size(); i++) {
        hinting_merkle_db.get_leaf_preimage_public_data_tree(i);
    }
    ExecutionHints collected_hints;
    hinting_merkle_db.dump_hints(collected_hints);

    // Check the collected hints:
    EXPECT_EQ(collected_hints.getLeafPreimageHintsPublicDataTree.size(), public_leaf_preimages.size());
    EXPECT_THAT(
        collected_hints.getLeafPreimageHintsPublicDataTree,
        testing::ElementsAreArray(
            { GetLeafPreimageHint<PublicDataTreeLeafPreimage>{
                  .hintKey = mock_tree_info.publicDataTree, .index = 0, .leafPreimage = public_leaf_preimages[0] },
              GetLeafPreimageHint<PublicDataTreeLeafPreimage>{
                  .hintKey = mock_tree_info.publicDataTree, .index = 1, .leafPreimage = public_leaf_preimages[1] },
              GetLeafPreimageHint<PublicDataTreeLeafPreimage>{
                  .hintKey = mock_tree_info.publicDataTree, .index = 2, .leafPreimage = public_leaf_preimages[2] } }));
    EXPECT_THAT(collected_hints.getSiblingPathHints,
                testing::ElementsAreArray({ GetSiblingPathHint{ .hintKey = mock_tree_info.publicDataTree,
                                                                .treeId = world_state::MerkleTreeId::PUBLIC_DATA_TREE,
                                                                .index = 0,
                                                                .path = mock_path },
                                            GetSiblingPathHint{ .hintKey = mock_tree_info.publicDataTree,
                                                                .treeId = world_state::MerkleTreeId::PUBLIC_DATA_TREE,
                                                                .index = 1,
                                                                .path = mock_path },
                                            GetSiblingPathHint{ .hintKey = mock_tree_info.publicDataTree,
                                                                .treeId = world_state::MerkleTreeId::PUBLIC_DATA_TREE,
                                                                .index = 2,
                                                                .path = mock_path } }));
}

TEST_F(MockedHintingDBsTest, InsertIndexedLeavesPublicDataTree)
{
    AppendOnlyTreeSnapshot state_before = mock_tree_info.publicDataTree;
    // Mock the leaf values:
    PublicDataLeafValue public_leaf_value = { 4, 7 };
    PublicDataLeafValue low_leaf_value = { 2, 6 };
    // IndexedLeaf<PublicDataLeafValue> public_leaf_preimage = { public_leaf_value, 1, 6 };
    SiblingPath mock_path((PUBLIC_DATA_TREE_HEIGHT));
    AppendOnlyTreeSnapshot mock_state_after = { mock_tree_info.publicDataTree.root++,
                                                mock_tree_info.publicDataTree.nextAvailableLeafIndex++ };
    LeafUpdateWitnessData<PublicDataLeafValue> mock_low_witness_data =
        LeafUpdateWitnessData<PublicDataLeafValue>{ { low_leaf_value, 0, 0 }, 0, mock_path };
    // get_leaf_preimage_public_data_tree will call get_tree_roots and get_tree_info (which itself will call
    // get_tree_roots):
    EXPECT_CALL(base_merkle_db, get_tree_roots).Times(2);
    EXPECT_CALL(base_merkle_db, insert_indexed_leaves_public_data_tree(testing::_))
        .WillOnce([&](PublicDataLeafValue value) {
            SequentialInsertionResult<PublicDataLeafValue> result = {
                .low_leaf_witness_data = { mock_low_witness_data },
                .insertion_witness_data = { { { value, 1, 6 }, 1, mock_path } }
            };
            mock_tree_info.publicDataTree = mock_state_after;
            return result;
        });

    // Call the db:
    hinting_merkle_db.insert_indexed_leaves_public_data_tree(public_leaf_value);
    ExecutionHints collected_hints;
    hinting_merkle_db.dump_hints(collected_hints);

    // Check the collected hints:
    EXPECT_EQ(collected_hints.sequentialInsertHintsPublicDataTree.size(), 1);
    EXPECT_THAT(collected_hints.sequentialInsertHintsPublicDataTree,
                testing::ElementsAre(SequentialInsertHint<PublicDataLeafValue>{
                    .hintKey = state_before,
                    .treeId = world_state::MerkleTreeId::PUBLIC_DATA_TREE,
                    .leaf = public_leaf_value,
                    .lowLeavesWitnessData = mock_low_witness_data,
                    .insertionWitnessData = { { public_leaf_value, 1, 6 }, 1, mock_path },
                    .stateAfter = mock_tree_info.publicDataTree }));
} // namespace

// TODO(MW): get_leaf_preimage_nullifier_tree, insert_indexed_leaves_nullifier_tree, append_leaves, checkpointing

} // namespace
} // namespace bb::avm2::simulation
