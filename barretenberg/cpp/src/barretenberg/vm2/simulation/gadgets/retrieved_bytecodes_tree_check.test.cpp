#include "barretenberg/vm2/simulation/gadgets/retrieved_bytecodes_tree_check.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/simulation/lib/retrieved_bytecodes_tree.hpp"
#include "barretenberg/vm2/simulation/testing/mock_indexed_tree_check.hpp"

namespace bb::avm2::simulation {

using ::testing::_;
using ::testing::Return;
using ::testing::StrictMock;

const std::optional<IndexedTreeSiloingParameters> NO_SILOING = std::nullopt;
const std::optional<uint64_t> NO_PUBLIC_INPUTS_INDEX = std::nullopt;

namespace {

TEST(AvmSimulationRetrievedBytecodesTreeCheck, ContainsNotExists)
{
    StrictMock<MockIndexedTreeCheck> mock_indexed_tree_check;
    RetrievedBytecodesTree tree = build_retrieved_bytecodes_tree();

    FF class_id = 42;
    auto snapshot = tree.get_snapshot();
    auto [exists, low_leaf_index] = tree.get_low_indexed_leaf(class_id);
    auto low_leaf = tree.get_leaf_preimage(low_leaf_index);
    ASSERT_FALSE(exists);

    IndexedTreeLeafData expected_leaf_data = {
        .value = low_leaf.leaf.class_id,
        .next_value = low_leaf.nextKey,
        .next_index = low_leaf.nextIndex,
    };

    EXPECT_CALL(mock_indexed_tree_check,
                assert_read(class_id, NO_SILOING, false, expected_leaf_data, low_leaf_index, _, snapshot));

    RetrievedBytecodesTreeCheck bytecodes_check(mock_indexed_tree_check, tree);
    EXPECT_FALSE(bytecodes_check.contains(class_id));
}

TEST(AvmSimulationRetrievedBytecodesTreeCheck, ContainsExists)
{
    StrictMock<MockIndexedTreeCheck> mock_indexed_tree_check;
    RetrievedBytecodesTree tree = build_retrieved_bytecodes_tree();
    tree.insert_indexed_leaves({ { ClassIdLeafValue(42) } });

    FF class_id = 42;
    auto snapshot = tree.get_snapshot();
    auto [exists, low_leaf_index] = tree.get_low_indexed_leaf(class_id);
    auto low_leaf = tree.get_leaf_preimage(low_leaf_index);
    ASSERT_TRUE(exists);

    IndexedTreeLeafData expected_leaf_data = {
        .value = low_leaf.leaf.class_id,
        .next_value = low_leaf.nextKey,
        .next_index = low_leaf.nextIndex,
    };

    EXPECT_CALL(mock_indexed_tree_check,
                assert_read(class_id, NO_SILOING, true, expected_leaf_data, low_leaf_index, _, snapshot));

    RetrievedBytecodesTreeCheck bytecodes_check(mock_indexed_tree_check, tree);
    EXPECT_TRUE(bytecodes_check.contains(class_id));
}

TEST(AvmSimulationRetrievedBytecodesTreeCheck, InsertExists)
{
    StrictMock<MockIndexedTreeCheck> mock_indexed_tree_check;
    RetrievedBytecodesTree tree = build_retrieved_bytecodes_tree();
    tree.insert_indexed_leaves({ { ClassIdLeafValue(42) } });

    FF class_id = 42;
    auto snapshot = tree.get_snapshot();

    EXPECT_CALL(mock_indexed_tree_check, write(class_id, NO_SILOING, NO_PUBLIC_INPUTS_INDEX, _, _, _, snapshot, _))
        .WillOnce(Return(snapshot));

    RetrievedBytecodesTreeCheck bytecodes_check(mock_indexed_tree_check, tree);
    bytecodes_check.insert(class_id);
    EXPECT_EQ(bytecodes_check.get_snapshot(), snapshot);
}

TEST(AvmSimulationRetrievedBytecodesTreeCheck, InsertAppend)
{
    StrictMock<MockIndexedTreeCheck> mock_indexed_tree_check;
    RetrievedBytecodesTree tree = build_retrieved_bytecodes_tree();

    FF class_id = 100;
    auto prev_snapshot = tree.get_snapshot();

    // Compute expected post-insert state.
    RetrievedBytecodesTree tree_after = tree;
    tree_after.insert_indexed_leaves({ { ClassIdLeafValue(class_id) } });
    auto next_snapshot = tree_after.get_snapshot();

    EXPECT_CALL(mock_indexed_tree_check, write(class_id, NO_SILOING, NO_PUBLIC_INPUTS_INDEX, _, _, _, prev_snapshot, _))
        .WillOnce(Return(next_snapshot));

    RetrievedBytecodesTreeCheck bytecodes_check(mock_indexed_tree_check, tree);
    bytecodes_check.insert(class_id);
    EXPECT_EQ(bytecodes_check.get_snapshot(), next_snapshot);
}

} // namespace

} // namespace bb::avm2::simulation
