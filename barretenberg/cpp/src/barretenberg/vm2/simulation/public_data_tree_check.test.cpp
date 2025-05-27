#include "barretenberg/vm2/simulation/public_data_tree_check.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/crypto/merkle_tree/memory_tree.hpp"
#include "barretenberg/vm2/simulation/events/public_data_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/testing/mock_field_gt.hpp"
#include "barretenberg/vm2/simulation/testing/mock_merkle_check.hpp"
#include "barretenberg/vm2/simulation/testing/mock_poseidon2.hpp"
#include "barretenberg/vm2/testing/macros.hpp"

namespace bb::avm2::simulation {

using ::testing::_;
using ::testing::ElementsAre;
using ::testing::Return;
using ::testing::StrictMock;

using RawPoseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

namespace {

TEST(AvmSimulationPublicDataTree, ReadExists)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<PublicDataTreeCheckEvent> event_emitter;
    PublicDataTreeCheck public_data_tree_check(poseidon2, merkle_check, field_gt, event_emitter);

    PublicDataTreeLeafPreimage low_leaf = PublicDataTreeLeafPreimage(PublicDataLeafValue(42, 27), 0, 0);
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 30;
    std::vector<FF> sibling_path = { 1, 2, 3, 4, 5 };
    AppendOnlyTreeSnapshot snapshot = {
        .root = 123456,
        .nextAvailableLeafIndex = 128,
    };
    FF leaf_slot = 42;
    FF value = 27;

    EXPECT_CALL(poseidon2, hash(low_leaf.get_hash_inputs())).WillRepeatedly(Return(FF(low_leaf_hash)));
    EXPECT_CALL(merkle_check, assert_membership(low_leaf_hash, low_leaf_index, _, snapshot.root))
        .WillRepeatedly(Return());

    public_data_tree_check.assert_read(leaf_slot, value, low_leaf, low_leaf_index, sibling_path, snapshot);

    PublicDataTreeCheckEvent expect_event = {
        .value = value,
        .slot = leaf_slot,
        .prev_snapshot = snapshot,
        .low_leaf_preimage = low_leaf,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
    };
    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));

    // Negative test: wrong value
    value = 28;
    EXPECT_THROW_WITH_MESSAGE(
        public_data_tree_check.assert_read(leaf_slot, value, low_leaf, low_leaf_index, sibling_path, snapshot),
        "Leaf value does not match value");
}

TEST(AvmSimulationPublicDataTree, ReadNotExistsLowPointsToInfinity)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<PublicDataTreeCheckEvent> event_emitter;
    PublicDataTreeCheck public_data_tree_check(poseidon2, merkle_check, field_gt, event_emitter);

    PublicDataTreeLeafPreimage low_leaf = PublicDataTreeLeafPreimage(PublicDataLeafValue(40, 27), 0, 0);
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 30;
    std::vector<FF> sibling_path = { 1, 2, 3, 4, 5 };
    AppendOnlyTreeSnapshot snapshot = {
        .root = 123456,
        .nextAvailableLeafIndex = 128,
    };
    FF leaf_slot = 42;
    FF value = 0;

    EXPECT_CALL(poseidon2, hash(low_leaf.get_hash_inputs())).WillRepeatedly(Return(FF(low_leaf_hash)));
    EXPECT_CALL(merkle_check, assert_membership(low_leaf_hash, low_leaf_index, _, snapshot.root))
        .WillRepeatedly(Return());
    EXPECT_CALL(field_gt, ff_gt(leaf_slot, low_leaf.leaf.slot)).WillRepeatedly(Return(true));

    public_data_tree_check.assert_read(leaf_slot, value, low_leaf, low_leaf_index, sibling_path, snapshot);
    PublicDataTreeCheckEvent expect_event = {
        .value = value,
        .slot = leaf_slot,
        .prev_snapshot = snapshot,
        .low_leaf_preimage = low_leaf,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
    };
    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));

    // Negative test: wrong value
    value = 1;
    EXPECT_THROW_WITH_MESSAGE(
        public_data_tree_check.assert_read(leaf_slot, value, low_leaf, low_leaf_index, sibling_path, snapshot),
        "Value is nonzero for a non existing slot");

    // Negative test: failed leaf_slot > low_leaf_preimage.value.slot
    EXPECT_CALL(field_gt, ff_gt(leaf_slot, low_leaf.leaf.slot)).WillOnce(Return(false));
    EXPECT_THROW_WITH_MESSAGE(
        public_data_tree_check.assert_read(leaf_slot, value, low_leaf, low_leaf_index, sibling_path, snapshot),
        "Low leaf slot is GTE leaf slot");
}

TEST(AvmSimulationPublicDataTree, ReadNotExistsLowPointsToAnotherLeaf)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<PublicDataTreeCheckEvent> event_emitter;
    PublicDataTreeCheck public_data_tree_check(poseidon2, merkle_check, field_gt, event_emitter);

    PublicDataTreeLeafPreimage low_leaf = PublicDataTreeLeafPreimage(PublicDataLeafValue(40, 27), 28, 50);
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 30;
    std::vector<FF> sibling_path = { 1, 2, 3, 4, 5 };
    AppendOnlyTreeSnapshot snapshot = {
        .root = 123456,
        .nextAvailableLeafIndex = 128,
    };
    FF leaf_slot = 42;
    FF value = 0;

    EXPECT_CALL(poseidon2, hash(low_leaf.get_hash_inputs())).WillRepeatedly(Return(FF(low_leaf_hash)));
    EXPECT_CALL(merkle_check, assert_membership(low_leaf_hash, low_leaf_index, _, snapshot.root))
        .WillRepeatedly(Return());
    EXPECT_CALL(field_gt, ff_gt(leaf_slot, low_leaf.leaf.slot)).WillRepeatedly(Return(true));
    EXPECT_CALL(field_gt, ff_gt(low_leaf.nextKey, leaf_slot)).WillRepeatedly(Return(true));

    public_data_tree_check.assert_read(leaf_slot, value, low_leaf, low_leaf_index, sibling_path, snapshot);
    PublicDataTreeCheckEvent expect_event = {
        .value = value,
        .slot = leaf_slot,
        .prev_snapshot = snapshot,
        .low_leaf_preimage = low_leaf,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
    };
    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));

    // Negative test: wrong value
    value = 1;
    EXPECT_THROW_WITH_MESSAGE(
        public_data_tree_check.assert_read(leaf_slot, value, low_leaf, low_leaf_index, sibling_path, snapshot),
        "Value is nonzero for a non existing slot");

    // Negative test: failed low_leaf_preimage.nextValue > leaf_slot
    EXPECT_CALL(field_gt, ff_gt(low_leaf.nextKey, leaf_slot)).WillOnce(Return(false));
    EXPECT_THROW_WITH_MESSAGE(
        public_data_tree_check.assert_read(leaf_slot, value, low_leaf, low_leaf_index, sibling_path, snapshot),
        "Leaf slot is GTE low leaf next slot");
}

TEST(AvmSimulationPublicDataTree, WriteExists)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<PublicDataTreeCheckEvent> event_emitter;
    PublicDataTreeCheck public_data_tree_check(poseidon2, merkle_check, field_gt, event_emitter);

    FF leaf_slot = 42;
    FF new_value = 27;

    MemoryTree<Poseidon2HashPolicy> public_data_tree(8);

    PublicDataTreeLeafPreimage low_leaf = PublicDataTreeLeafPreimage(PublicDataLeafValue(leaf_slot, 1), 0, 0);
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 30;
    public_data_tree.update_element(low_leaf_index, low_leaf_hash);

    AppendOnlyTreeSnapshot prev_snapshot =
        AppendOnlyTreeSnapshot{ .root = public_data_tree.root(), .nextAvailableLeafIndex = 128 };
    std::vector<FF> low_leaf_sibling_path = public_data_tree.get_sibling_path(low_leaf_index);

    PublicDataTreeLeafPreimage updated_low_leaf = low_leaf;
    updated_low_leaf.leaf.value = new_value;
    FF updated_low_leaf_hash = RawPoseidon2::hash(updated_low_leaf.get_hash_inputs());
    public_data_tree.update_element(low_leaf_index, updated_low_leaf_hash);

    FF intermediate_root = public_data_tree.root();
    std::vector<FF> insertion_sibling_path = public_data_tree.get_sibling_path(prev_snapshot.nextAvailableLeafIndex);

    // No insertion happens
    AppendOnlyTreeSnapshot next_snapshot =
        AppendOnlyTreeSnapshot{ .root = intermediate_root,
                                .nextAvailableLeafIndex = prev_snapshot.nextAvailableLeafIndex };

    EXPECT_CALL(poseidon2, hash(_)).WillRepeatedly([](const std::vector<FF>& input) {
        return RawPoseidon2::hash(input);
    });

    EXPECT_CALL(merkle_check, write(low_leaf_hash, updated_low_leaf_hash, low_leaf_index, _, prev_snapshot.root))
        .WillRepeatedly(Return(intermediate_root));

    AppendOnlyTreeSnapshot result_snapshot = public_data_tree_check.write(
        leaf_slot, new_value, low_leaf, low_leaf_index, low_leaf_sibling_path, prev_snapshot, insertion_sibling_path);

    EXPECT_EQ(next_snapshot, result_snapshot);

    PublicDataTreeCheckEvent expect_event = {
        .value = new_value,
        .slot = leaf_slot,
        .prev_snapshot = prev_snapshot,
        .low_leaf_preimage = low_leaf,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
        .write_data = PublicDataWriteData{ .updated_low_leaf_preimage = updated_low_leaf,
                                           .updated_low_leaf_hash = updated_low_leaf_hash,
                                           .new_leaf_hash = 0,
                                           .intermediate_root = intermediate_root,
                                           .next_snapshot = next_snapshot },
    };
    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));
}

TEST(AvmSimulationPublicDataTree, WriteNotExists)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<PublicDataTreeCheckEvent> event_emitter;
    PublicDataTreeCheck public_data_tree_check(poseidon2, merkle_check, field_gt, event_emitter);

    FF leaf_slot = 42;
    FF new_value = 27;
    FF low_leaf_slot = 40;

    MemoryTree<Poseidon2HashPolicy> public_data_tree(8);

    PublicDataTreeLeafPreimage low_leaf = PublicDataTreeLeafPreimage(PublicDataLeafValue(low_leaf_slot, 1), 0, 0);
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 30;
    public_data_tree.update_element(low_leaf_index, low_leaf_hash);

    AppendOnlyTreeSnapshot prev_snapshot =
        AppendOnlyTreeSnapshot{ .root = public_data_tree.root(), .nextAvailableLeafIndex = 128 };
    std::vector<FF> low_leaf_sibling_path = public_data_tree.get_sibling_path(low_leaf_index);

    PublicDataTreeLeafPreimage updated_low_leaf = low_leaf;
    updated_low_leaf.nextIndex = prev_snapshot.nextAvailableLeafIndex;
    updated_low_leaf.nextKey = leaf_slot;
    FF updated_low_leaf_hash = RawPoseidon2::hash(updated_low_leaf.get_hash_inputs());
    public_data_tree.update_element(low_leaf_index, updated_low_leaf_hash);

    FF intermediate_root = public_data_tree.root();
    std::vector<FF> insertion_sibling_path = public_data_tree.get_sibling_path(prev_snapshot.nextAvailableLeafIndex);

    PublicDataTreeLeafPreimage new_leaf =
        PublicDataTreeLeafPreimage(PublicDataLeafValue(leaf_slot, new_value), low_leaf.nextIndex, low_leaf.nextKey);
    FF new_leaf_hash = RawPoseidon2::hash(new_leaf.get_hash_inputs());
    public_data_tree.update_element(prev_snapshot.nextAvailableLeafIndex, new_leaf_hash);

    AppendOnlyTreeSnapshot next_snapshot =
        AppendOnlyTreeSnapshot{ .root = public_data_tree.root(),
                                .nextAvailableLeafIndex = prev_snapshot.nextAvailableLeafIndex + 1 };

    EXPECT_CALL(poseidon2, hash(_)).WillRepeatedly([](const std::vector<FF>& input) {
        return RawPoseidon2::hash(input);
    });
    EXPECT_CALL(merkle_check, write(low_leaf_hash, updated_low_leaf_hash, low_leaf_index, _, prev_snapshot.root))
        .WillRepeatedly(Return(intermediate_root));
    EXPECT_CALL(field_gt, ff_gt(leaf_slot, low_leaf.leaf.slot)).WillRepeatedly(Return(true));
    EXPECT_CALL(merkle_check, write(FF(0), new_leaf_hash, prev_snapshot.nextAvailableLeafIndex, _, intermediate_root))
        .WillRepeatedly(Return(next_snapshot.root));

    AppendOnlyTreeSnapshot result_snapshot = public_data_tree_check.write(
        leaf_slot, new_value, low_leaf, low_leaf_index, low_leaf_sibling_path, prev_snapshot, insertion_sibling_path);

    EXPECT_EQ(next_snapshot, result_snapshot);

    PublicDataTreeCheckEvent expect_event = {
        .value = new_value,
        .slot = leaf_slot,
        .prev_snapshot = prev_snapshot,
        .low_leaf_preimage = low_leaf,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
        .write_data = PublicDataWriteData{ .updated_low_leaf_preimage = updated_low_leaf,
                                           .updated_low_leaf_hash = updated_low_leaf_hash,
                                           .new_leaf_hash = new_leaf_hash,
                                           .intermediate_root = intermediate_root,
                                           .next_snapshot = next_snapshot },
    };
    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));
}

} // namespace

} // namespace bb::avm2::simulation
