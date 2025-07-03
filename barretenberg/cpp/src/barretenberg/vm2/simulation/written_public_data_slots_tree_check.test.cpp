#include "barretenberg/vm2/simulation/written_public_data_slots_tree_check.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/crypto/merkle_tree/memory_tree.hpp"
#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/events/written_public_data_slot_tree_check_event.hpp"
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

TEST(AvmSimulationWrittenPublicDataSlotsTree, ReadExists)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<WrittenPublicDataSlotsTreeCheckEvent> event_emitter;
    WrittenPublicDataSlotsTreeCheck written_public_data_slots_tree_check(
        poseidon2, merkle_check, field_gt, event_emitter);

    FF slot = 42;
    AztecAddress contract_address = AztecAddress(27);
    FF leaf_slot = RawPoseidon2::hash({ GENERATOR_INDEX__PUBLIC_LEAF_INDEX, contract_address, slot });

    WrittenPublicDataSlotsTreeLeafPreimage low_leaf =
        WrittenPublicDataSlotsTreeLeafPreimage(WrittenPublicDataSlotLeafValue(leaf_slot), 0, 0);
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 30;
    std::vector<FF> sibling_path = { 1, 2, 3, 4, 5 };
    AppendOnlyTreeSnapshot snapshot = AppendOnlyTreeSnapshot{ .root = 123456, .nextAvailableLeafIndex = 128 };

    EXPECT_CALL(poseidon2, hash(std::vector<FF>{ GENERATOR_INDEX__PUBLIC_LEAF_INDEX, contract_address, slot }))
        .WillRepeatedly(Return(FF(leaf_slot)));
    EXPECT_CALL(poseidon2, hash(low_leaf.get_hash_inputs())).WillRepeatedly(Return(FF(low_leaf_hash)));
    EXPECT_CALL(merkle_check, assert_membership(low_leaf_hash, low_leaf_index, _, snapshot.root))
        .WillRepeatedly(Return());

    written_public_data_slots_tree_check.assert_read(
        slot, contract_address, true, low_leaf, low_leaf_index, sibling_path, snapshot);

    WrittenPublicDataSlotsTreeCheckEvent expect_event = {
        .contract_address = contract_address,
        .slot = slot,
        .leaf_slot = leaf_slot,
        .prev_snapshot = snapshot,
        .next_snapshot = snapshot,
        .low_leaf_preimage = low_leaf,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
    };
    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));

    // Negative test: claim that slot does not exist
    EXPECT_CALL(field_gt, ff_gt(leaf_slot, low_leaf.leaf.slot)).WillOnce(Return(false));
    EXPECT_THROW_WITH_MESSAGE(written_public_data_slots_tree_check.assert_read(
                                  slot, contract_address, false, low_leaf, low_leaf_index, sibling_path, snapshot),
                              "Low leaf slot is GTE leaf slot");
}

TEST(AvmSimulationWrittenPublicDataSlotsTree, ReadNotExistsLowPointsToInfinity)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<WrittenPublicDataSlotsTreeCheckEvent> event_emitter;
    WrittenPublicDataSlotsTreeCheck written_public_data_slots_tree_check(
        poseidon2, merkle_check, field_gt, event_emitter);

    FF slot = 42;
    AztecAddress contract_address = AztecAddress(27);
    FF leaf_slot = RawPoseidon2::hash({ GENERATOR_INDEX__PUBLIC_LEAF_INDEX, contract_address, slot });
    FF low_slot = 40;

    WrittenPublicDataSlotsTreeLeafPreimage low_leaf =
        WrittenPublicDataSlotsTreeLeafPreimage(WrittenPublicDataSlotLeafValue(low_slot), 0, 0);
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 30;
    std::vector<FF> sibling_path = { 1, 2, 3, 4, 5 };
    AppendOnlyTreeSnapshot snapshot = AppendOnlyTreeSnapshot{ .root = 123456, .nextAvailableLeafIndex = 128 };

    EXPECT_CALL(poseidon2, hash(std::vector<FF>{ GENERATOR_INDEX__PUBLIC_LEAF_INDEX, contract_address, slot }))
        .WillRepeatedly(Return(FF(leaf_slot)));
    EXPECT_CALL(poseidon2, hash(low_leaf.get_hash_inputs())).WillRepeatedly(Return(FF(low_leaf_hash)));
    EXPECT_CALL(merkle_check, assert_membership(low_leaf_hash, low_leaf_index, _, snapshot.root))
        .WillRepeatedly(Return());
    EXPECT_CALL(field_gt, ff_gt(leaf_slot, low_leaf.leaf.slot)).WillRepeatedly(Return(true));

    written_public_data_slots_tree_check.assert_read(
        slot, contract_address, false, low_leaf, low_leaf_index, sibling_path, snapshot);

    WrittenPublicDataSlotsTreeCheckEvent expect_event = {
        .contract_address = contract_address,
        .slot = slot,
        .leaf_slot = leaf_slot,
        .prev_snapshot = snapshot,
        .next_snapshot = snapshot,
        .low_leaf_preimage = low_leaf,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
    };
    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));

    // Negative test: slot exists
    EXPECT_THROW_WITH_MESSAGE(written_public_data_slots_tree_check.assert_read(
                                  slot, contract_address, true, low_leaf, low_leaf_index, sibling_path, snapshot),
                              "Slot membership check failed");

    // Negative test: failed leaf_slot > low_leaf_preimage.leaf.slot
    EXPECT_THROW_WITH_MESSAGE(written_public_data_slots_tree_check.assert_read(
                                  slot, contract_address, true, low_leaf, low_leaf_index, sibling_path, snapshot),
                              "Slot membership check failed");
}

TEST(AvmSimulationWrittenPublicDataSlotsTree, ReadNotExistsLowPointsToAnotherLeaf)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<WrittenPublicDataSlotsTreeCheckEvent> event_emitter;
    WrittenPublicDataSlotsTreeCheck written_public_data_slots_tree_check(
        poseidon2, merkle_check, field_gt, event_emitter);

    FF slot = 42;
    AztecAddress contract_address = AztecAddress(27);
    FF leaf_slot = RawPoseidon2::hash({ GENERATOR_INDEX__PUBLIC_LEAF_INDEX, contract_address, slot });
    FF low_slot = 40;

    WrittenPublicDataSlotsTreeLeafPreimage low_leaf =
        WrittenPublicDataSlotsTreeLeafPreimage(WrittenPublicDataSlotLeafValue(low_slot), 28, leaf_slot + 1);
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 30;
    std::vector<FF> sibling_path = { 1, 2, 3, 4, 5 };
    AppendOnlyTreeSnapshot snapshot = AppendOnlyTreeSnapshot{ .root = 123456, .nextAvailableLeafIndex = 128 };

    EXPECT_CALL(poseidon2, hash(std::vector<FF>{ GENERATOR_INDEX__PUBLIC_LEAF_INDEX, contract_address, slot }))
        .WillRepeatedly(Return(FF(leaf_slot)));
    EXPECT_CALL(poseidon2, hash(low_leaf.get_hash_inputs())).WillRepeatedly(Return(FF(low_leaf_hash)));
    EXPECT_CALL(merkle_check, assert_membership(low_leaf_hash, low_leaf_index, _, snapshot.root))
        .WillRepeatedly(Return());
    EXPECT_CALL(field_gt, ff_gt(leaf_slot, low_leaf.leaf.slot)).WillRepeatedly(Return(true));
    EXPECT_CALL(field_gt, ff_gt(low_leaf.nextKey, leaf_slot)).WillRepeatedly(Return(true));

    written_public_data_slots_tree_check.assert_read(
        slot, contract_address, false, low_leaf, low_leaf_index, sibling_path, snapshot);

    WrittenPublicDataSlotsTreeCheckEvent expect_event = {
        .contract_address = contract_address,
        .slot = slot,
        .leaf_slot = leaf_slot,
        .prev_snapshot = snapshot,
        .next_snapshot = snapshot,
        .low_leaf_preimage = low_leaf,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
    };
    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));

    // Negative test: slot exists
    EXPECT_THROW_WITH_MESSAGE(written_public_data_slots_tree_check.assert_read(
                                  slot, contract_address, true, low_leaf, low_leaf_index, sibling_path, snapshot),
                              "Slot membership check failed");

    // Negative test: failed low_leaf_preimage.nextKey > leaf_slot
    EXPECT_THROW_WITH_MESSAGE(written_public_data_slots_tree_check.assert_read(
                                  slot, contract_address, true, low_leaf, low_leaf_index, sibling_path, snapshot),
                              "Slot membership check failed");
}

TEST(AvmSimulationWrittenPublicDataSlotsTree, UpsertExists)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<WrittenPublicDataSlotsTreeCheckEvent> event_emitter;
    WrittenPublicDataSlotsTreeCheck written_public_data_slots_tree_check(
        poseidon2, merkle_check, field_gt, event_emitter);

    FF slot = 42;
    AztecAddress contract_address = AztecAddress(27);
    FF leaf_slot = RawPoseidon2::hash({ GENERATOR_INDEX__PUBLIC_LEAF_INDEX, contract_address, slot });

    WrittenPublicDataSlotsTreeLeafPreimage low_leaf =
        WrittenPublicDataSlotsTreeLeafPreimage(WrittenPublicDataSlotLeafValue(leaf_slot), 0, 0);
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 30;
    std::vector<FF> sibling_path = { 1, 2, 3, 4, 5 };
    AppendOnlyTreeSnapshot snapshot = AppendOnlyTreeSnapshot{ .root = 123456, .nextAvailableLeafIndex = 128 };

    EXPECT_CALL(poseidon2, hash(std::vector<FF>{ GENERATOR_INDEX__PUBLIC_LEAF_INDEX, contract_address, slot }))
        .WillRepeatedly(Return(FF(leaf_slot)));
    EXPECT_CALL(poseidon2, hash(low_leaf.get_hash_inputs())).WillRepeatedly(Return(FF(low_leaf_hash)));
    EXPECT_CALL(merkle_check, assert_membership(low_leaf_hash, low_leaf_index, _, snapshot.root))
        .WillRepeatedly(Return());

    AppendOnlyTreeSnapshot result_snapshot = written_public_data_slots_tree_check.upsert(
        slot, contract_address, low_leaf, low_leaf_index, sibling_path, snapshot, sibling_path);

    EXPECT_EQ(result_snapshot, snapshot);

    WrittenPublicDataSlotsTreeCheckEvent expect_event = {
        .contract_address = contract_address,
        .slot = slot,
        .leaf_slot = leaf_slot,
        .prev_snapshot = snapshot,
        .next_snapshot = snapshot,
        .low_leaf_preimage = low_leaf,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
        .write = true,
    };
    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));
}

TEST(AvmSimulationWrittenPublicDataSlotsTree, UpsertAppend)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<WrittenPublicDataSlotsTreeCheckEvent> event_emitter;
    WrittenPublicDataSlotsTreeCheck written_public_data_slots_tree_check(
        poseidon2, merkle_check, field_gt, event_emitter);

    FF slot = 100;
    AztecAddress contract_address = AztecAddress(27);
    FF leaf_slot = RawPoseidon2::hash({ GENERATOR_INDEX__PUBLIC_LEAF_INDEX, contract_address, slot });
    FF low_slot = 40;

    MemoryTree<Poseidon2HashPolicy> written_public_data_slots_tree(8);

    WrittenPublicDataSlotsTreeLeafPreimage low_leaf =
        WrittenPublicDataSlotsTreeLeafPreimage(WrittenPublicDataSlotLeafValue(low_slot), 10, leaf_slot + 1);
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 0;
    written_public_data_slots_tree.update_element(low_leaf_index, low_leaf_hash);

    AppendOnlyTreeSnapshot prev_snapshot =
        AppendOnlyTreeSnapshot{ .root = written_public_data_slots_tree.root(), .nextAvailableLeafIndex = 128 };
    std::vector<FF> low_leaf_sibling_path = written_public_data_slots_tree.get_sibling_path(low_leaf_index);

    WrittenPublicDataSlotsTreeLeafPreimage updated_low_leaf = low_leaf;
    updated_low_leaf.nextIndex = prev_snapshot.nextAvailableLeafIndex;
    updated_low_leaf.nextKey = leaf_slot;
    FF updated_low_leaf_hash = RawPoseidon2::hash(updated_low_leaf.get_hash_inputs());
    written_public_data_slots_tree.update_element(low_leaf_index, updated_low_leaf_hash);

    FF intermediate_root = written_public_data_slots_tree.root();
    std::vector<FF> insertion_sibling_path =
        written_public_data_slots_tree.get_sibling_path(prev_snapshot.nextAvailableLeafIndex);

    WrittenPublicDataSlotsTreeLeafPreimage new_leaf = WrittenPublicDataSlotsTreeLeafPreimage(
        WrittenPublicDataSlotLeafValue(leaf_slot), low_leaf.nextIndex, low_leaf.nextKey);
    FF new_leaf_hash = RawPoseidon2::hash(new_leaf.get_hash_inputs());
    written_public_data_slots_tree.update_element(prev_snapshot.nextAvailableLeafIndex, new_leaf_hash);

    AppendOnlyTreeSnapshot next_snapshot =
        AppendOnlyTreeSnapshot{ .root = written_public_data_slots_tree.root(),
                                .nextAvailableLeafIndex = prev_snapshot.nextAvailableLeafIndex + 1 };

    EXPECT_CALL(poseidon2, hash(_)).WillRepeatedly([](const std::vector<FF>& input) {
        return RawPoseidon2::hash(input);
    });
    EXPECT_CALL(merkle_check, write(low_leaf_hash, updated_low_leaf_hash, low_leaf_index, _, prev_snapshot.root))
        .WillRepeatedly(Return(intermediate_root));
    EXPECT_CALL(field_gt, ff_gt(leaf_slot, low_leaf.leaf.slot)).WillRepeatedly(Return(true));
    EXPECT_CALL(field_gt, ff_gt(low_leaf.nextKey, leaf_slot)).WillRepeatedly(Return(true));
    EXPECT_CALL(merkle_check, write(FF(0), new_leaf_hash, prev_snapshot.nextAvailableLeafIndex, _, intermediate_root))
        .WillRepeatedly(Return(next_snapshot.root));

    AppendOnlyTreeSnapshot result_snapshot = written_public_data_slots_tree_check.upsert(
        slot, contract_address, low_leaf, low_leaf_index, low_leaf_sibling_path, prev_snapshot, insertion_sibling_path);

    EXPECT_EQ(next_snapshot, result_snapshot);

    WrittenPublicDataSlotsTreeCheckEvent expect_event = { .contract_address = contract_address,
                                                          .slot = slot,
                                                          .leaf_slot = leaf_slot,
                                                          .prev_snapshot = prev_snapshot,
                                                          .next_snapshot = next_snapshot,
                                                          .low_leaf_preimage = low_leaf,
                                                          .low_leaf_hash = low_leaf_hash,
                                                          .low_leaf_index = low_leaf_index,
                                                          .write = true,
                                                          .append_data = SlotAppendData{
                                                              .updated_low_leaf_hash = updated_low_leaf_hash,
                                                              .new_leaf_hash = new_leaf_hash,
                                                              .intermediate_root = intermediate_root,
                                                          } };

    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));

    // Negative test: failed leaf_slot > low_leaf_preimage.leaf.slot
    EXPECT_CALL(field_gt, ff_gt(leaf_slot, low_leaf.leaf.slot)).WillOnce(Return(false));
    EXPECT_THROW_WITH_MESSAGE(written_public_data_slots_tree_check.upsert(slot,
                                                                          contract_address,
                                                                          low_leaf,
                                                                          low_leaf_index,
                                                                          low_leaf_sibling_path,
                                                                          prev_snapshot,
                                                                          insertion_sibling_path),
                              "Low leaf slot is GTE leaf slot");
    EXPECT_CALL(field_gt, ff_gt(leaf_slot, low_leaf.leaf.slot)).WillOnce(Return(true));

    // Negative test: failed low_leaf_preimage.nextKey > leaf_slot
    EXPECT_CALL(field_gt, ff_gt(low_leaf.nextKey, leaf_slot)).WillOnce(Return(false));
    EXPECT_THROW_WITH_MESSAGE(written_public_data_slots_tree_check.upsert(slot,
                                                                          contract_address,
                                                                          low_leaf,
                                                                          low_leaf_index,
                                                                          low_leaf_sibling_path,
                                                                          prev_snapshot,
                                                                          insertion_sibling_path),
                              "Leaf slot is GTE low leaf next slot");
}

} // namespace

} // namespace bb::avm2::simulation
