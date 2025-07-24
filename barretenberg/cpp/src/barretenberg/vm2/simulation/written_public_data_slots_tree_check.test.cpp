#include "barretenberg/vm2/simulation/written_public_data_slots_tree_check.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/crypto/merkle_tree/memory_tree.hpp"
#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/events/written_public_data_slot_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"
#include "barretenberg/vm2/simulation/lib/written_slots_tree.hpp"
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

TEST(AvmSimulationWrittenPublicDataSlotsTree, ContainsNotExists)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<WrittenPublicDataSlotsTreeCheckEvent> event_emitter;

    FF slot = 42;
    AztecAddress contract_address = AztecAddress(27);
    FF leaf_slot = RawPoseidon2::hash({ GENERATOR_INDEX__PUBLIC_LEAF_INDEX, contract_address, slot });

    WrittenPublicDataSlotsTree initial_state = build_public_data_slots_tree();

    // Prefill will point to our new leaf
    ASSERT_EQ(initial_state.get_snapshot().nextAvailableLeafIndex, 1);
    uint64_t low_leaf_index = 0;
    WrittenPublicDataSlotsTreeLeafPreimage low_leaf = initial_state.get_leaf_preimage(low_leaf_index);

    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());

    auto sibling_path = initial_state.get_sibling_path(0);
    auto snapshot = initial_state.get_snapshot();

    WrittenPublicDataSlotsTreeCheck written_public_data_slots_tree_check(
        poseidon2, merkle_check, field_gt, initial_state, event_emitter);

    EXPECT_CALL(poseidon2, hash(std::vector<FF>{ GENERATOR_INDEX__PUBLIC_LEAF_INDEX, contract_address, slot }))
        .WillRepeatedly(Return(FF(leaf_slot)));
    EXPECT_CALL(poseidon2, hash(low_leaf.get_hash_inputs())).WillRepeatedly(Return(FF(low_leaf_hash)));
    EXPECT_CALL(merkle_check, assert_membership(low_leaf_hash, low_leaf_index, _, snapshot.root))
        .WillRepeatedly(Return());
    EXPECT_CALL(field_gt, ff_gt(leaf_slot, low_leaf.leaf.slot)).WillRepeatedly(Return(true));

    EXPECT_FALSE(written_public_data_slots_tree_check.contains(contract_address, slot));

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
}

TEST(AvmSimulationWrittenPublicDataSlotsTree, ContainsExists)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<WrittenPublicDataSlotsTreeCheckEvent> event_emitter;
    WrittenPublicDataSlotsTree initial_state = build_public_data_slots_tree();

    FF slot = 42;
    AztecAddress contract_address = AztecAddress(27);
    FF leaf_slot = RawPoseidon2::hash({ GENERATOR_INDEX__PUBLIC_LEAF_INDEX, contract_address, slot });

    uint64_t low_leaf_index = initial_state.get_snapshot().nextAvailableLeafIndex;
    initial_state.insert_indexed_leaves({ { WrittenPublicDataSlotLeafValue(leaf_slot) } });

    WrittenPublicDataSlotsTreeLeafPreimage low_leaf = initial_state.get_leaf_preimage(low_leaf_index);
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    std::vector<FF> sibling_path = initial_state.get_sibling_path(low_leaf_index);
    auto snapshot = initial_state.get_snapshot();

    WrittenPublicDataSlotsTreeCheck written_public_data_slots_tree_check(
        poseidon2, merkle_check, field_gt, initial_state, event_emitter);

    EXPECT_CALL(poseidon2, hash(std::vector<FF>{ GENERATOR_INDEX__PUBLIC_LEAF_INDEX, contract_address, slot }))
        .WillRepeatedly(Return(FF(leaf_slot)));
    EXPECT_CALL(poseidon2, hash(low_leaf.get_hash_inputs())).WillRepeatedly(Return(FF(low_leaf_hash)));
    EXPECT_CALL(merkle_check, assert_membership(low_leaf_hash, low_leaf_index, _, snapshot.root))
        .WillRepeatedly(Return());

    EXPECT_TRUE(written_public_data_slots_tree_check.contains(contract_address, slot));

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
}

TEST(AvmSimulationWrittenPublicDataSlotsTree, ReadNotExistsLowPointsToAnotherLeaf)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<WrittenPublicDataSlotsTreeCheckEvent> event_emitter;

    WrittenPublicDataSlotsTree initial_state = build_public_data_slots_tree();
    // Prefill now points to leaf MAX
    initial_state.insert_indexed_leaves({ { WrittenPublicDataSlotLeafValue(FF::neg_one()) } });

    FF slot = 42;
    AztecAddress contract_address = AztecAddress(27);
    FF leaf_slot = RawPoseidon2::hash({ GENERATOR_INDEX__PUBLIC_LEAF_INDEX, contract_address, slot });

    auto low_leaf = initial_state.get_leaf_preimage(0);

    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 0;
    std::vector<FF> sibling_path = initial_state.get_sibling_path(low_leaf_index);
    AppendOnlyTreeSnapshot snapshot = initial_state.get_snapshot();

    WrittenPublicDataSlotsTreeCheck written_public_data_slots_tree_check(
        poseidon2, merkle_check, field_gt, initial_state, event_emitter);

    EXPECT_CALL(poseidon2, hash(std::vector<FF>{ GENERATOR_INDEX__PUBLIC_LEAF_INDEX, contract_address, slot }))
        .WillRepeatedly(Return(FF(leaf_slot)));
    EXPECT_CALL(poseidon2, hash(low_leaf.get_hash_inputs())).WillRepeatedly(Return(FF(low_leaf_hash)));
    EXPECT_CALL(merkle_check, assert_membership(low_leaf_hash, low_leaf_index, _, snapshot.root))
        .WillRepeatedly(Return());
    EXPECT_CALL(field_gt, ff_gt(leaf_slot, low_leaf.leaf.slot)).WillRepeatedly(Return(true));
    EXPECT_CALL(field_gt, ff_gt(low_leaf.nextKey, leaf_slot)).WillRepeatedly(Return(true));

    written_public_data_slots_tree_check.contains(contract_address, slot);

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
}

TEST(AvmSimulationWrittenPublicDataSlotsTree, InsertExists)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<WrittenPublicDataSlotsTreeCheckEvent> event_emitter;

    FF slot = 42;
    AztecAddress contract_address = AztecAddress(27);
    FF leaf_slot = RawPoseidon2::hash({ GENERATOR_INDEX__PUBLIC_LEAF_INDEX, contract_address, slot });

    WrittenPublicDataSlotsTree initial_state = build_public_data_slots_tree();
    uint64_t low_leaf_index = initial_state.get_snapshot().nextAvailableLeafIndex;
    initial_state.insert_indexed_leaves({ { WrittenPublicDataSlotLeafValue(leaf_slot) } });

    WrittenPublicDataSlotsTreeLeafPreimage low_leaf = initial_state.get_leaf_preimage(low_leaf_index);
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    std::vector<FF> sibling_path = initial_state.get_sibling_path(low_leaf_index);
    AppendOnlyTreeSnapshot snapshot = initial_state.get_snapshot();

    WrittenPublicDataSlotsTreeCheck written_public_data_slots_tree_check(
        poseidon2, merkle_check, field_gt, initial_state, event_emitter);

    EXPECT_CALL(poseidon2, hash(std::vector<FF>{ GENERATOR_INDEX__PUBLIC_LEAF_INDEX, contract_address, slot }))
        .WillRepeatedly(Return(FF(leaf_slot)));
    EXPECT_CALL(poseidon2, hash(low_leaf.get_hash_inputs())).WillRepeatedly(Return(FF(low_leaf_hash)));
    EXPECT_CALL(merkle_check, assert_membership(low_leaf_hash, low_leaf_index, _, snapshot.root))
        .WillRepeatedly(Return());

    written_public_data_slots_tree_check.insert(contract_address, slot);

    EXPECT_EQ(written_public_data_slots_tree_check.snapshot(), snapshot);

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

TEST(AvmSimulationWrittenPublicDataSlotsTree, InsertAppend)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<WrittenPublicDataSlotsTreeCheckEvent> event_emitter;

    FF slot = 100;
    AztecAddress contract_address = AztecAddress(27);
    FF leaf_slot = RawPoseidon2::hash({ GENERATOR_INDEX__PUBLIC_LEAF_INDEX, contract_address, slot });

    WrittenPublicDataSlotsTree initial_state = build_public_data_slots_tree();
    // Prefill will point to our new leaf
    ASSERT_EQ(initial_state.get_snapshot().nextAvailableLeafIndex, 1);
    uint64_t low_leaf_index = 0;
    uint64_t new_leaf_index = 1;
    WrittenPublicDataSlotsTreeLeafPreimage low_leaf = initial_state.get_leaf_preimage(low_leaf_index);

    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    WrittenPublicDataSlotsTree state_after_insert = initial_state;
    state_after_insert.insert_indexed_leaves({ { WrittenPublicDataSlotLeafValue(leaf_slot) } });

    std::vector<FF> low_leaf_sibling_path = initial_state.get_sibling_path(low_leaf_index);

    WrittenPublicDataSlotsTreeLeafPreimage updated_low_leaf = low_leaf;
    updated_low_leaf.nextIndex = new_leaf_index;
    updated_low_leaf.nextKey = leaf_slot;
    FF updated_low_leaf_hash = RawPoseidon2::hash(updated_low_leaf.get_hash_inputs());

    FF intermediate_root = unconstrained_root_from_path(updated_low_leaf_hash, low_leaf_index, low_leaf_sibling_path);
    std::vector<FF> insertion_sibling_path = state_after_insert.get_sibling_path(new_leaf_index);

    WrittenPublicDataSlotsTreeLeafPreimage new_leaf = WrittenPublicDataSlotsTreeLeafPreimage(
        WrittenPublicDataSlotLeafValue(leaf_slot), low_leaf.nextIndex, low_leaf.nextKey);
    FF new_leaf_hash = RawPoseidon2::hash(new_leaf.get_hash_inputs());

    WrittenPublicDataSlotsTreeCheck written_public_data_slots_tree_check(
        poseidon2, merkle_check, field_gt, initial_state, event_emitter);

    EXPECT_CALL(poseidon2, hash(_)).WillRepeatedly([](const std::vector<FF>& input) {
        return RawPoseidon2::hash(input);
    });
    EXPECT_CALL(merkle_check,
                write(low_leaf_hash, updated_low_leaf_hash, low_leaf_index, _, initial_state.get_snapshot().root))
        .WillRepeatedly(Return(intermediate_root));
    EXPECT_CALL(field_gt, ff_gt(leaf_slot, low_leaf.leaf.slot)).WillRepeatedly(Return(true));
    EXPECT_CALL(field_gt, ff_gt(low_leaf.nextKey, leaf_slot)).WillRepeatedly(Return(true));
    EXPECT_CALL(merkle_check, write(FF(0), new_leaf_hash, new_leaf_index, _, intermediate_root))
        .WillRepeatedly(Return(state_after_insert.get_snapshot().root));

    written_public_data_slots_tree_check.insert(contract_address, slot);

    EXPECT_EQ(written_public_data_slots_tree_check.snapshot(), state_after_insert.get_snapshot());

    WrittenPublicDataSlotsTreeCheckEvent expect_event = { .contract_address = contract_address,
                                                          .slot = slot,
                                                          .leaf_slot = leaf_slot,
                                                          .prev_snapshot = initial_state.get_snapshot(),
                                                          .next_snapshot = state_after_insert.get_snapshot(),
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
}

TEST(AvmSimulationWrittenPublicDataSlotsTree, CheckpointBehavior)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<WrittenPublicDataSlotsTreeCheckEvent> event_emitter;

    EXPECT_CALL(poseidon2, hash(_)).WillRepeatedly([](const std::vector<FF>& input) {
        return RawPoseidon2::hash(input);
    });
    EXPECT_CALL(merkle_check, write)
        .WillRepeatedly(
            [](FF current_leaf, FF new_leaf, uint64_t leaf_index, std::span<const FF> sibling_path, FF prev_root) {
                EXPECT_EQ(unconstrained_root_from_path(current_leaf, leaf_index, sibling_path), prev_root);
                return unconstrained_root_from_path(new_leaf, leaf_index, sibling_path);
            });
    EXPECT_CALL(merkle_check, assert_membership(_, _, _, _))
        .WillRepeatedly([](FF current_leaf, uint64_t leaf_index, std::span<const FF> sibling_path, FF prev_root) {
            EXPECT_EQ(unconstrained_root_from_path(current_leaf, leaf_index, sibling_path), prev_root);
        });
    EXPECT_CALL(field_gt, ff_gt(_, _)).WillRepeatedly(Return(true));

    WrittenPublicDataSlotsTree initial_state = build_public_data_slots_tree();
    WrittenPublicDataSlotsTreeCheck written_public_data_slots_tree_check(
        poseidon2, merkle_check, field_gt, initial_state, event_emitter);

    EXPECT_EQ(written_public_data_slots_tree_check.size(), 0);
    written_public_data_slots_tree_check.create_checkpoint();

    written_public_data_slots_tree_check.insert(AztecAddress(1), 1);
    EXPECT_TRUE(written_public_data_slots_tree_check.contains(AztecAddress(1), 1));
    EXPECT_EQ(written_public_data_slots_tree_check.size(), 1);

    // Commit the checkpoint
    written_public_data_slots_tree_check.commit_checkpoint();
    EXPECT_TRUE(written_public_data_slots_tree_check.contains(AztecAddress(1), 1));
    EXPECT_EQ(written_public_data_slots_tree_check.size(), 1);

    // Create another checkpoint
    written_public_data_slots_tree_check.create_checkpoint();

    // Insert another slot
    written_public_data_slots_tree_check.insert(AztecAddress(2), 2);
    EXPECT_TRUE(written_public_data_slots_tree_check.contains(AztecAddress(2), 2));
    EXPECT_EQ(written_public_data_slots_tree_check.size(), 2);

    // Revert the checkpoint
    written_public_data_slots_tree_check.revert_checkpoint();
    EXPECT_TRUE(written_public_data_slots_tree_check.contains(AztecAddress(1), 1));
    EXPECT_EQ(written_public_data_slots_tree_check.size(), 1);
}

} // namespace

} // namespace bb::avm2::simulation
