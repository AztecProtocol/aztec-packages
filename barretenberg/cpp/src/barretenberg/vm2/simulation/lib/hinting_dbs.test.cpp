#include "barretenberg/vm2/simulation/lib/hinting_dbs.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/vm2/avm_api.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/lib/raw_data_dbs.hpp"
#include "barretenberg/vm2/simulation/testing/mock_dbs.hpp"
#include "barretenberg/vm2/simulation_helper.hpp"

#include <algorithm>
#include <cstddef>
#include <cstdlib>
#include <gmock/gmock.h>
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
    {}

    template <typename Hint>
    void compare_hints(const std::vector<Hint>& input_hints, const std::vector<Hint>& collected_hints)
    {
        for (const Hint& input_hint : input_hints) {
            EXPECT_FALSE(std::ranges::find(collected_hints.begin(), collected_hints.end(), input_hint) ==
                         collected_hints.end());
        }

        for (const Hint& collected_hint : collected_hints) {
            EXPECT_FALSE(std::ranges::find(input_hints.begin(), input_hints.end(), collected_hint) ==
                         input_hints.end());
        }
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

// A helper to reset the randomly generated values in avm_inputs.testdata.bin to avoid unrelated failures:
AvmProvingInputs fix_hint_keys(AvmProvingInputs inputs)
{
    auto reset_action_counters = [&]<typename H>(std::vector<H>& hints) {
        for (auto& hint : hints) {
            hint.hintKey = 0;
        }
    };
    auto reset_tree_id = [&]<typename H>(std::vector<H>& hints) {
        for (auto& hint : hints) {
            // The AVM handles treeIds 0 - 3:
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
    fix_hint_keys(AvmProvingInputs::from(read_file("../src/barretenberg/vm2/testing/avm_inputs.testdata.bin")));

class HintingDBsTestInputTest : public HintingDBsTest {
  protected:
    HintingDBsTestInputTest()
        : HintingDBsTest(avm_inputs_testdata)
    {}
};

TEST_F(HintingDBsTestInputTest, GetContractInstance)
{
    for (const auto& instance_hint : inputs.hints.contractInstances) {
        auto instance = hinting_contract_db.get_contract_instance(instance_hint.address);
        EXPECT_TRUE(instance.has_value());
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
        EXPECT_THAT(klass.value(), base_contract_db.get_contract_class(class_hint.classId).value());
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
    EXPECT_EQ(collected_hints.getSiblingPathHints.size(), update_preimage_slots.size());
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
    EXPECT_EQ(collected_hints.getSiblingPathHints.size(), note_hash_leaf_values.size());
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
    EXPECT_EQ(collected_hints.getSiblingPathHints.size(), public_leaf_preimages.size());
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

TEST_F(MockedHintingDBsTest, GetLeafPreimageNullifierTree)
{
    // Mock some leaf values:
    std::vector<NullifierLeafValue> nullifier_leaf_values = { { 1 }, { 2 }, { 4 } };
    std::vector<IndexedLeaf<NullifierLeafValue>> nullifier_leaf_preimages = { { nullifier_leaf_values[0], 1, 6 },
                                                                              { nullifier_leaf_values[1], 2, 4 },
                                                                              { nullifier_leaf_values[2], 0, 3 } };
    SiblingPath mock_path((NULLIFIER_TREE_HEIGHT));
    // get_leaf_preimage_nullifier_tree will call get_tree_roots and get_sibling_path (which itself will call
    // get_tree_roots):
    EXPECT_CALL(base_merkle_db, get_tree_roots).Times(static_cast<int>(nullifier_leaf_preimages.size() * 2));
    EXPECT_CALL(base_merkle_db, get_sibling_path(world_state::MerkleTreeId::NULLIFIER_TREE, testing::_))
        .WillRepeatedly([&](world_state::MerkleTreeId, index_t) { return mock_path; });
    EXPECT_CALL(base_merkle_db, get_leaf_preimage_nullifier_tree(testing::_)).WillRepeatedly([&](index_t index) {
        if (index < nullifier_leaf_preimages.size()) {
            return nullifier_leaf_preimages[index];
        }
        throw std::runtime_error("Leaf preimage not found");
    });

    // Call the db:
    for (index_t i = 0; i < nullifier_leaf_preimages.size(); i++) {
        hinting_merkle_db.get_leaf_preimage_nullifier_tree(i);
    }
    ExecutionHints collected_hints;
    hinting_merkle_db.dump_hints(collected_hints);

    // Check the collected hints:
    EXPECT_EQ(collected_hints.getLeafPreimageHintsNullifierTree.size(), nullifier_leaf_preimages.size());
    EXPECT_EQ(collected_hints.getSiblingPathHints.size(), nullifier_leaf_preimages.size());
    EXPECT_THAT(
        collected_hints.getLeafPreimageHintsNullifierTree,
        testing::ElementsAreArray(
            { GetLeafPreimageHint<NullifierTreeLeafPreimage>{
                  .hintKey = mock_tree_info.nullifierTree, .index = 0, .leafPreimage = nullifier_leaf_preimages[0] },
              GetLeafPreimageHint<NullifierTreeLeafPreimage>{
                  .hintKey = mock_tree_info.nullifierTree, .index = 1, .leafPreimage = nullifier_leaf_preimages[1] },
              GetLeafPreimageHint<NullifierTreeLeafPreimage>{ .hintKey = mock_tree_info.nullifierTree,
                                                              .index = 2,
                                                              .leafPreimage = nullifier_leaf_preimages[2] } }));
    EXPECT_THAT(collected_hints.getSiblingPathHints,
                testing::ElementsAreArray({ GetSiblingPathHint{ .hintKey = mock_tree_info.nullifierTree,
                                                                .treeId = world_state::MerkleTreeId::NULLIFIER_TREE,
                                                                .index = 0,
                                                                .path = mock_path },
                                            GetSiblingPathHint{ .hintKey = mock_tree_info.nullifierTree,
                                                                .treeId = world_state::MerkleTreeId::NULLIFIER_TREE,
                                                                .index = 1,
                                                                .path = mock_path },
                                            GetSiblingPathHint{ .hintKey = mock_tree_info.nullifierTree,
                                                                .treeId = world_state::MerkleTreeId::NULLIFIER_TREE,
                                                                .index = 2,
                                                                .path = mock_path } }));
}

TEST_F(MockedHintingDBsTest, InsertIndexedLeavesPublicDataTree)
{
    AppendOnlyTreeSnapshot state_before = mock_tree_info.publicDataTree;
    // Mock the leaf values:
    PublicDataLeafValue public_leaf_value = { 4, 7 };
    PublicDataLeafValue low_leaf_value = { 2, 6 };
    SiblingPath mock_path((PUBLIC_DATA_TREE_HEIGHT));
    AppendOnlyTreeSnapshot mock_state_after = { mock_tree_info.publicDataTree.root++,
                                                mock_tree_info.publicDataTree.nextAvailableLeafIndex++ };
    LeafUpdateWitnessData<PublicDataLeafValue> mock_low_witness_data =
        LeafUpdateWitnessData<PublicDataLeafValue>{ { low_leaf_value, 0, 0 }, 0, mock_path };
    // insert_indexed_leaves_public_data_tree will call get_tree_roots and get_tree_info (which itself will call
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
}

TEST_F(MockedHintingDBsTest, InsertIndexedLeavesNullifierTree)
{
    AppendOnlyTreeSnapshot state_before = mock_tree_info.nullifierTree;
    // Mock the leaf values:
    NullifierLeafValue nullifier = { 4 };
    NullifierLeafValue low_leaf_value = { 2 };
    SiblingPath mock_path((NULLIFIER_TREE_HEIGHT));
    AppendOnlyTreeSnapshot mock_state_after = { mock_tree_info.nullifierTree.root++,
                                                mock_tree_info.nullifierTree.nextAvailableLeafIndex++ };
    LeafUpdateWitnessData<NullifierLeafValue> mock_low_witness_data =
        LeafUpdateWitnessData<NullifierLeafValue>{ { low_leaf_value, 0, 0 }, 0, mock_path };
    // insert_indexed_leaves_nullifier_tree will call get_tree_roots and get_tree_info (which itself will call
    // get_tree_roots):
    EXPECT_CALL(base_merkle_db, get_tree_roots).Times(2);
    EXPECT_CALL(base_merkle_db, insert_indexed_leaves_nullifier_tree(testing::_))
        .WillOnce([&](NullifierLeafValue value) {
            SequentialInsertionResult<NullifierLeafValue> result = { .low_leaf_witness_data = { mock_low_witness_data },
                                                                     .insertion_witness_data = {
                                                                         { { value, 1, 6 }, 1, mock_path } } };
            mock_tree_info.nullifierTree = mock_state_after;
            return result;
        });

    // Call the db:
    hinting_merkle_db.insert_indexed_leaves_nullifier_tree(nullifier);
    ExecutionHints collected_hints;
    hinting_merkle_db.dump_hints(collected_hints);

    // Check the collected hints:
    EXPECT_EQ(collected_hints.sequentialInsertHintsNullifierTree.size(), 1);
    EXPECT_THAT(collected_hints.sequentialInsertHintsNullifierTree,
                testing::ElementsAre(SequentialInsertHint<NullifierLeafValue>{
                    .hintKey = state_before,
                    .treeId = world_state::MerkleTreeId::NULLIFIER_TREE,
                    .leaf = nullifier,
                    .lowLeavesWitnessData = mock_low_witness_data,
                    .insertionWitnessData = { { nullifier, 1, 6 }, 1, mock_path },
                    .stateAfter = mock_tree_info.nullifierTree }));
}

TEST_F(MockedHintingDBsTest, AppendLeaves)
{
    // Set initial state:
    mock_tree_info.noteHashTree = { 0, 0 };
    // Mock the leaf values:
    std::vector<FF> note_hash_leaf_values = { 11, 22, 44, 88 };
    SiblingPath mock_path((NOTE_HASH_TREE_HEIGHT));
    auto mock_append_internal = [&](world_state::MerkleTreeId, const FF&) -> AppendLeafResult {
        auto this_path = mock_path;
        auto this_index = mock_tree_info.noteHashTree.nextAvailableLeafIndex;
        auto this_sibling =
            this_index % 2 == 0 ? note_hash_leaf_values[this_index + 1] : note_hash_leaf_values[this_index - 1];
        this_path[0] = this_sibling;
        AppendLeafResult result = { mock_tree_info.noteHashTree.root, mock_path };
        mock_tree_info.noteHashTree.nextAvailableLeafIndex++;
        mock_tree_info.noteHashTree.root += 2;
        return result;
    };
    auto int_state = mock_tree_info.noteHashTree;
    auto expected_end_state = mock_tree_info;
    expected_end_state.noteHashTree = { int_state.root + 2 * note_hash_leaf_values.size(),
                                        int_state.nextAvailableLeafIndex + note_hash_leaf_values.size() };
    // append_leaves will call get_tree_info at the beginning and end of appending leaves:
    EXPECT_CALL(base_merkle_db, get_tree_roots)
        .WillOnce(testing::Return(mock_tree_info))
        .WillOnce(testing::Return(expected_end_state));
    EXPECT_CALL(base_merkle_db, append_leaves(world_state::MerkleTreeId::NOTE_HASH_TREE, testing::_))
        .WillOnce([&](world_state::MerkleTreeId, std::span<const FF> leaves) {
            std::vector<AppendLeafResult> results;
            for (const auto& leaf : leaves) {
                results.push_back(mock_append_internal(world_state::MerkleTreeId::NOTE_HASH_TREE, leaf));
            }
            return results;
        });

    // Call the db:
    hinting_merkle_db.append_leaves(world_state::MerkleTreeId::NOTE_HASH_TREE, note_hash_leaf_values);
    ExecutionHints collected_hints;
    hinting_merkle_db.dump_hints(collected_hints);

    std::vector<AppendLeavesHint> expected_append_hints;
    std::vector<GetSiblingPathHint> expected_sibling_hints;
    for (const auto& leaf : note_hash_leaf_values) {
        AppendOnlyTreeSnapshot state_after = { int_state.root + 2, int_state.nextAvailableLeafIndex + 1 };
        expected_append_hints.push_back(AppendLeavesHint{ .hintKey = int_state,
                                                          .stateAfter = state_after,
                                                          .treeId = world_state::MerkleTreeId::NOTE_HASH_TREE,
                                                          .leaves = { leaf } });
        expected_sibling_hints.push_back(GetSiblingPathHint{ .hintKey = state_after,
                                                             .treeId = world_state::MerkleTreeId::NOTE_HASH_TREE,
                                                             .index = int_state.nextAvailableLeafIndex,
                                                             .path = mock_path });
        int_state = state_after;
    }

    // Check the collected hints:
    EXPECT_EQ(collected_hints.appendLeavesHints.size(), note_hash_leaf_values.size());
    EXPECT_EQ(collected_hints.getSiblingPathHints.size(), note_hash_leaf_values.size());
    EXPECT_THAT(collected_hints.appendLeavesHints, testing::ElementsAreArray(expected_append_hints));
    EXPECT_THAT(collected_hints.getSiblingPathHints, testing::ElementsAreArray(expected_sibling_hints));
}

TEST_F(MockedHintingDBsTest, MerkleDBCheckpoints)
{
    uint32_t mock_checkpoint_id = 0;
    EXPECT_CALL(base_merkle_db, get_checkpoint_id)
        .WillOnce(testing::Return(mock_checkpoint_id))
        .WillOnce(testing::Return(++mock_checkpoint_id))
        .WillOnce(testing::Return(mock_checkpoint_id))
        .WillOnce(testing::Return(++mock_checkpoint_id));
    ;
    EXPECT_CALL(base_merkle_db, create_checkpoint).Times(2);
    // Call the db:
    hinting_merkle_db.create_checkpoint();
    hinting_merkle_db.create_checkpoint();

    EXPECT_CALL(base_merkle_db, get_checkpoint_id)
        .WillOnce(testing::Return(mock_checkpoint_id))
        .WillOnce(testing::Return(--mock_checkpoint_id));
    EXPECT_CALL(base_merkle_db, commit_checkpoint).Times(1);
    hinting_merkle_db.commit_checkpoint();

    // revert_checkpoint will call get_tree_roots before and after calling the underlying db::
    EXPECT_CALL(base_merkle_db, get_tree_roots).Times(2);

    EXPECT_CALL(base_merkle_db, get_checkpoint_id)
        .WillOnce(testing::Return(mock_checkpoint_id))
        .WillOnce(testing::Return(--mock_checkpoint_id));
    EXPECT_CALL(base_merkle_db, revert_checkpoint).Times(1);
    hinting_merkle_db.revert_checkpoint();
    ExecutionHints collected_hints;
    hinting_merkle_db.dump_hints(collected_hints);

    // Check the collected hints:
    EXPECT_EQ(collected_hints.createCheckpointHints.size(), 2);
    EXPECT_EQ(collected_hints.commitCheckpointHints.size(), 1);
    EXPECT_EQ(collected_hints.revertCheckpointHints.size(), 1);
    mock_checkpoint_id = 0;
    uint32_t mock_action_counter = 0;
    EXPECT_THAT(collected_hints.createCheckpointHints,
                testing::ElementsAreArray({ CreateCheckpointHint{
                                                .actionCounter = mock_action_counter++,
                                                .oldCheckpointId = mock_checkpoint_id,
                                                .newCheckpointId = ++mock_checkpoint_id,
                                            },
                                            CreateCheckpointHint{
                                                .actionCounter = mock_action_counter++,
                                                .oldCheckpointId = mock_checkpoint_id,
                                                .newCheckpointId = ++mock_checkpoint_id,
                                            } }));
    EXPECT_THAT(collected_hints.commitCheckpointHints,
                testing::ElementsAre(CommitCheckpointHint{
                    .actionCounter = mock_action_counter++,
                    .oldCheckpointId = mock_checkpoint_id,
                    .newCheckpointId = --mock_checkpoint_id,
                }));
    EXPECT_THAT(collected_hints.revertCheckpointHints,
                testing::ElementsAre(RevertCheckpointHint{
                    .actionCounter = mock_action_counter++,
                    .oldCheckpointId = mock_checkpoint_id,
                    .newCheckpointId = --mock_checkpoint_id,
                    .stateBefore = mock_tree_info,
                    .stateAfter = mock_tree_info,
                }));
} // namespace

} // namespace
} // namespace bb::avm2::simulation
