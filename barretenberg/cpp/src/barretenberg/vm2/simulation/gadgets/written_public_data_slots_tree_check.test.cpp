#include "barretenberg/vm2/simulation/gadgets/written_public_data_slots_tree_check.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"
#include "barretenberg/vm2/simulation/lib/written_slots_tree.hpp"
#include "barretenberg/vm2/simulation/testing/mock_indexed_tree_check.hpp"

namespace bb::avm2::simulation {

using ::testing::_;
using ::testing::Return;
using ::testing::StrictMock;

const std::optional<uint64_t> NO_PUBLIC_INPUTS_INDEX = std::nullopt;

namespace {

const IndexedTreeSiloingParameters SLOT_SILOING_PARAMS = {
    .address = AztecAddress(27),
    .siloing_separator = DOM_SEP__PUBLIC_LEAF_SLOT,
};
const std::optional<IndexedTreeSiloingParameters> OPT_SLOT_SILOING_PARAMS = SLOT_SILOING_PARAMS;

TEST(AvmSimulationWrittenPublicDataSlotsTreeCheck, ContainsNotExists)
{
    StrictMock<MockIndexedTreeCheck> mock_indexed_tree_check;
    WrittenPublicDataSlotsTree tree = build_public_data_slots_tree();

    FF slot = 42;
    AztecAddress address = SLOT_SILOING_PARAMS.address;
    FF leaf_slot = unconstrained_compute_leaf_slot(address, slot);

    auto snapshot = tree.get_snapshot();
    auto [exists, low_leaf_index] = tree.get_low_indexed_leaf(leaf_slot);
    auto low_leaf = tree.get_leaf_preimage(low_leaf_index);
    ASSERT_FALSE(exists);

    IndexedTreeLeafData expected_leaf_data = {
        .value = low_leaf.leaf.slot,
        .next_value = low_leaf.nextKey,
        .next_index = low_leaf.nextIndex,
    };

    EXPECT_CALL(mock_indexed_tree_check,
                assert_read(slot, OPT_SLOT_SILOING_PARAMS, false, expected_leaf_data, low_leaf_index, _, snapshot));

    WrittenPublicDataSlotsTreeCheck slots_check(mock_indexed_tree_check, tree);
    EXPECT_FALSE(slots_check.contains(address, slot));
}

TEST(AvmSimulationWrittenPublicDataSlotsTreeCheck, ContainsExists)
{
    StrictMock<MockIndexedTreeCheck> mock_indexed_tree_check;
    WrittenPublicDataSlotsTree tree = build_public_data_slots_tree();

    FF slot = 42;
    AztecAddress address = SLOT_SILOING_PARAMS.address;
    FF leaf_slot = unconstrained_compute_leaf_slot(address, slot);
    tree.insert_indexed_leaves({ { WrittenPublicDataSlotLeafValue(leaf_slot) } });

    auto snapshot = tree.get_snapshot();
    auto [exists, low_leaf_index] = tree.get_low_indexed_leaf(leaf_slot);
    auto low_leaf = tree.get_leaf_preimage(low_leaf_index);
    ASSERT_TRUE(exists);

    IndexedTreeLeafData expected_leaf_data = {
        .value = low_leaf.leaf.slot,
        .next_value = low_leaf.nextKey,
        .next_index = low_leaf.nextIndex,
    };

    EXPECT_CALL(mock_indexed_tree_check,
                assert_read(slot, OPT_SLOT_SILOING_PARAMS, true, expected_leaf_data, low_leaf_index, _, snapshot));

    WrittenPublicDataSlotsTreeCheck slots_check(mock_indexed_tree_check, tree);
    EXPECT_TRUE(slots_check.contains(address, slot));
}

TEST(AvmSimulationWrittenPublicDataSlotsTreeCheck, InsertExists)
{
    StrictMock<MockIndexedTreeCheck> mock_indexed_tree_check;
    WrittenPublicDataSlotsTree tree = build_public_data_slots_tree();

    FF slot = 42;
    AztecAddress address = SLOT_SILOING_PARAMS.address;
    FF leaf_slot = unconstrained_compute_leaf_slot(address, slot);
    tree.insert_indexed_leaves({ { WrittenPublicDataSlotLeafValue(leaf_slot) } });

    auto snapshot = tree.get_snapshot();

    EXPECT_CALL(mock_indexed_tree_check,
                write(slot, OPT_SLOT_SILOING_PARAMS, NO_PUBLIC_INPUTS_INDEX, _, _, _, snapshot, _))
        .WillOnce(Return(snapshot));

    WrittenPublicDataSlotsTreeCheck slots_check(mock_indexed_tree_check, tree);
    slots_check.insert(address, slot);
    EXPECT_EQ(slots_check.get_snapshot(), snapshot);
}

TEST(AvmSimulationWrittenPublicDataSlotsTreeCheck, InsertAppend)
{
    StrictMock<MockIndexedTreeCheck> mock_indexed_tree_check;
    WrittenPublicDataSlotsTree tree = build_public_data_slots_tree();

    FF slot = 100;
    AztecAddress address = SLOT_SILOING_PARAMS.address;
    FF leaf_slot = unconstrained_compute_leaf_slot(address, slot);
    auto prev_snapshot = tree.get_snapshot();

    // Compute expected post-insert state.
    WrittenPublicDataSlotsTree tree_after = tree;
    tree_after.insert_indexed_leaves({ { WrittenPublicDataSlotLeafValue(leaf_slot) } });
    auto next_snapshot = tree_after.get_snapshot();

    EXPECT_CALL(mock_indexed_tree_check,
                write(slot, OPT_SLOT_SILOING_PARAMS, NO_PUBLIC_INPUTS_INDEX, _, _, _, prev_snapshot, _))
        .WillOnce(Return(next_snapshot));

    WrittenPublicDataSlotsTreeCheck slots_check(mock_indexed_tree_check, tree);
    slots_check.insert(address, slot);
    EXPECT_EQ(slots_check.get_snapshot(), next_snapshot);
}

TEST(AvmSimulationWrittenPublicDataSlotsTreeCheck, CheckpointBehavior)
{
    // Use NiceMock since checkpoint behavior exercises multiple contains/inserts and
    // we don't want to specify exact expectations for every internal call.
    testing::NiceMock<MockIndexedTreeCheck> mock_indexed_tree_check;
    WrittenPublicDataSlotsTree tree = build_public_data_slots_tree();

    // Track inserts in a parallel tree so the write mock returns correct snapshots.
    WrittenPublicDataSlotsTree parallel_tree = tree;
    ON_CALL(mock_indexed_tree_check, write)
        .WillByDefault([&parallel_tree](const FF& slot,
                                        std::optional<IndexedTreeSiloingParameters> siloing_params,
                                        std::optional<uint64_t>,
                                        const IndexedTreeLeafData&,
                                        uint64_t,
                                        std::span<const FF>,
                                        const AppendOnlyTreeSnapshot&,
                                        std::optional<std::span<const FF>> insertion_path) -> AppendOnlyTreeSnapshot {
            if (insertion_path.has_value()) {
                FF leaf_slot = unconstrained_compute_leaf_slot(siloing_params.value().address, slot);
                parallel_tree.insert_indexed_leaves({ { WrittenPublicDataSlotLeafValue(leaf_slot) } });
            }
            return parallel_tree.get_snapshot();
        });

    WrittenPublicDataSlotsTreeCheck slots_check(mock_indexed_tree_check, tree);

    EXPECT_EQ(slots_check.size(), 0);
    slots_check.create_checkpoint();

    AztecAddress address1 = AztecAddress(1);
    slots_check.insert(address1, 1);
    EXPECT_TRUE(slots_check.contains(address1, 1));
    EXPECT_EQ(slots_check.size(), 1);

    // Commit the checkpoint.
    slots_check.commit_checkpoint();
    EXPECT_TRUE(slots_check.contains(address1, 1));
    EXPECT_EQ(slots_check.size(), 1);

    // Create another checkpoint.
    slots_check.create_checkpoint();

    // Insert another slot.
    AztecAddress address2 = AztecAddress(2);
    slots_check.insert(address2, 2);
    EXPECT_TRUE(slots_check.contains(address2, 2));
    EXPECT_EQ(slots_check.size(), 2);

    // Revert the checkpoint.
    slots_check.revert_checkpoint();
    EXPECT_TRUE(slots_check.contains(address1, 1));
    EXPECT_EQ(slots_check.size(), 1);
}

} // namespace

} // namespace bb::avm2::simulation
