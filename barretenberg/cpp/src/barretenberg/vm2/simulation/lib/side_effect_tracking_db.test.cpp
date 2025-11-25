#include "barretenberg/vm2/simulation/lib/side_effect_tracking_db.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"
#include "barretenberg/vm2/simulation/testing/mock_dbs.hpp"
#include "barretenberg/vm2/simulation/testing/mock_side_effect_tracker.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

namespace bb::avm2::simulation {
namespace {

using ::testing::Return;
using ::testing::ReturnRef;
using ::testing::StrictMock;

class SideEffectTrackingDBTest : public ::testing::Test {
  protected:
    FF first_nullifier = FF(42);
    StrictMock<MockHighLevelMerkleDB> mock_merkle_db;
    StrictMock<MockSideEffectTracker> mock_tracker;
    TrackedSideEffects tracked_effects;
};

TEST_F(SideEffectTrackingDBTest, StorageRead)
{
    SideEffectTrackingDB db(first_nullifier, mock_merkle_db, mock_tracker);
    AztecAddress contract_addr(0x1234);
    FF slot(100);
    FF expected_value(200);

    EXPECT_CALL(mock_merkle_db, storage_read(contract_addr, slot)).WillOnce(Return(expected_value));

    FF result = db.storage_read(contract_addr, slot);
    EXPECT_EQ(result, expected_value);
}

TEST_F(SideEffectTrackingDBTest, WasStorageWritten)
{
    SideEffectTrackingDB db(first_nullifier, mock_merkle_db, mock_tracker);
    AztecAddress contract_addr(0x1234);
    FF slot(100);

    EXPECT_CALL(mock_merkle_db, was_storage_written(contract_addr, slot)).WillOnce(Return(true));

    bool result = db.was_storage_written(contract_addr, slot);
    EXPECT_TRUE(result);
}

TEST_F(SideEffectTrackingDBTest, NullifierExists)
{
    SideEffectTrackingDB db(first_nullifier, mock_merkle_db, mock_tracker);
    AztecAddress contract_addr(0x1234);
    FF nullifier(999);

    EXPECT_CALL(mock_merkle_db, nullifier_exists(contract_addr, nullifier)).WillOnce(Return(false));

    bool result = db.nullifier_exists(contract_addr, nullifier);
    EXPECT_FALSE(result);
}

TEST_F(SideEffectTrackingDBTest, SiloedNullifierExists)
{
    SideEffectTrackingDB db(first_nullifier, mock_merkle_db, mock_tracker);
    FF nullifier(888);

    EXPECT_CALL(mock_merkle_db, siloed_nullifier_exists(nullifier)).WillOnce(Return(true));

    bool result = db.siloed_nullifier_exists(nullifier);
    EXPECT_TRUE(result);
}

TEST_F(SideEffectTrackingDBTest, NoteHashExists)
{
    SideEffectTrackingDB db(first_nullifier, mock_merkle_db, mock_tracker);
    uint64_t leaf_index = 5;
    FF unique_note_hash(777);

    EXPECT_CALL(mock_merkle_db, note_hash_exists(leaf_index, unique_note_hash)).WillOnce(Return(true));

    bool result = db.note_hash_exists(leaf_index, unique_note_hash);
    EXPECT_TRUE(result);
}

TEST_F(SideEffectTrackingDBTest, L1ToL2MsgExists)
{
    SideEffectTrackingDB db(first_nullifier, mock_merkle_db, mock_tracker);
    uint64_t leaf_index = 10;
    FF msg_hash(666);

    EXPECT_CALL(mock_merkle_db, l1_to_l2_msg_exists(leaf_index, msg_hash)).WillOnce(Return(false));

    bool result = db.l1_to_l2_msg_exists(leaf_index, msg_hash);
    EXPECT_FALSE(result);
}

TEST_F(SideEffectTrackingDBTest, GetCheckpointId)
{
    SideEffectTrackingDB db(first_nullifier, mock_merkle_db, mock_tracker);
    uint32_t expected_id = 123;

    EXPECT_CALL(mock_merkle_db, get_checkpoint_id()).WillOnce(Return(expected_id));

    uint32_t result = db.get_checkpoint_id();
    EXPECT_EQ(result, expected_id);
}

TEST_F(SideEffectTrackingDBTest, GetTreeState)
{
    SideEffectTrackingDB db(first_nullifier, mock_merkle_db, mock_tracker);
    TreeStates expected_states = {
        .note_hash_tree = { .tree = { .root = FF(1), .next_available_leaf_index = 2 }, .counter = 2 },
        .nullifier_tree = { .tree = { .root = FF(3), .next_available_leaf_index = 4 }, .counter = 4 },
        .l1_to_l2_message_tree = { .tree = { .root = FF(5), .next_available_leaf_index = 6 }, .counter = 6 },
        .public_data_tree = { .tree = { .root = FF(7), .next_available_leaf_index = 8 }, .counter = 8 },
    };

    EXPECT_CALL(mock_merkle_db, get_tree_state()).WillOnce(Return(expected_states));

    TreeStates result = db.get_tree_state();
    EXPECT_EQ(result, expected_states);
}

TEST_F(SideEffectTrackingDBTest, StorageWrite)
{
    SideEffectTrackingDB db(first_nullifier, mock_merkle_db, mock_tracker);
    AztecAddress contract_addr(0x1234);
    FF slot(100);
    FF value(200);
    bool is_protocol_write = false;
    FF leaf_slot = unconstrained_compute_leaf_slot(contract_addr, slot);

    EXPECT_CALL(mock_merkle_db, storage_write(contract_addr, slot, value, is_protocol_write));
    EXPECT_CALL(mock_tracker, add_storage_write(leaf_slot, value));

    db.storage_write(contract_addr, slot, value, is_protocol_write);
}

TEST_F(SideEffectTrackingDBTest, NullifierWrite)
{
    SideEffectTrackingDB db(first_nullifier, mock_merkle_db, mock_tracker);
    AztecAddress contract_addr(0x1234);
    FF nullifier(999);
    FF siloed_nullifier = unconstrained_silo_nullifier(contract_addr, nullifier);

    EXPECT_CALL(mock_merkle_db, nullifier_write(contract_addr, nullifier));
    EXPECT_CALL(mock_tracker, add_nullifier(siloed_nullifier));

    db.nullifier_write(contract_addr, nullifier);
}

TEST_F(SideEffectTrackingDBTest, SiloedNullifierWrite)
{
    SideEffectTrackingDB db(first_nullifier, mock_merkle_db, mock_tracker);
    FF nullifier(888);

    EXPECT_CALL(mock_merkle_db, siloed_nullifier_write(nullifier));
    EXPECT_CALL(mock_tracker, add_nullifier(nullifier));

    db.siloed_nullifier_write(nullifier);
}

TEST_F(SideEffectTrackingDBTest, NoteHashWrite)
{
    TrackedSideEffects tracked_effects = { .note_hashes = { FF(2) } };
    const uint32_t note_hash_counter = static_cast<uint32_t>(tracked_effects.note_hashes.size());

    SideEffectTrackingDB db(first_nullifier, mock_merkle_db, mock_tracker);
    AztecAddress contract_addr(0x1234);
    FF note_hash(777);
    FF unique_note_hash = unconstrained_make_unique_note_hash(
        unconstrained_silo_note_hash(contract_addr, note_hash), first_nullifier, note_hash_counter);

    EXPECT_CALL(mock_tracker, get_side_effects()).WillOnce(ReturnRef(tracked_effects));
    EXPECT_CALL(mock_merkle_db, note_hash_write(contract_addr, note_hash));
    EXPECT_CALL(mock_tracker, add_note_hash(unique_note_hash));

    db.note_hash_write(contract_addr, note_hash);
}

TEST_F(SideEffectTrackingDBTest, SiloedNoteHashWrite)
{
    TrackedSideEffects tracked_effects = { .note_hashes = { FF(2) } };
    const uint32_t note_hash_counter = static_cast<uint32_t>(tracked_effects.note_hashes.size());

    SideEffectTrackingDB db(first_nullifier, mock_merkle_db, mock_tracker);
    FF siloed_note_hash(555);
    FF unique_note_hash = unconstrained_make_unique_note_hash(siloed_note_hash, first_nullifier, note_hash_counter);

    EXPECT_CALL(mock_tracker, get_side_effects()).WillOnce(ReturnRef(tracked_effects));
    EXPECT_CALL(mock_merkle_db, siloed_note_hash_write(siloed_note_hash));
    EXPECT_CALL(mock_tracker, add_note_hash(unique_note_hash));

    db.siloed_note_hash_write(siloed_note_hash);
}

TEST_F(SideEffectTrackingDBTest, UniqueNoteHashWrite)
{
    SideEffectTrackingDB db(first_nullifier, mock_merkle_db, mock_tracker);
    FF unique_note_hash(444);

    EXPECT_CALL(mock_merkle_db, unique_note_hash_write(unique_note_hash));
    EXPECT_CALL(mock_tracker, add_note_hash(unique_note_hash));

    db.unique_note_hash_write(unique_note_hash);
}

TEST_F(SideEffectTrackingDBTest, CreateCheckpoint)
{
    SideEffectTrackingDB db(first_nullifier, mock_merkle_db, mock_tracker);

    EXPECT_CALL(mock_merkle_db, create_checkpoint());
    EXPECT_CALL(mock_tracker, create_checkpoint());

    db.create_checkpoint();
}

TEST_F(SideEffectTrackingDBTest, CommitCheckpoint)
{
    SideEffectTrackingDB db(first_nullifier, mock_merkle_db, mock_tracker);

    EXPECT_CALL(mock_merkle_db, commit_checkpoint());
    EXPECT_CALL(mock_tracker, commit_checkpoint());

    db.commit_checkpoint();
}

TEST_F(SideEffectTrackingDBTest, RevertCheckpoint)
{
    SideEffectTrackingDB db(first_nullifier, mock_merkle_db, mock_tracker);

    EXPECT_CALL(mock_merkle_db, revert_checkpoint());
    EXPECT_CALL(mock_tracker, revert_checkpoint());

    db.revert_checkpoint();
}

TEST_F(SideEffectTrackingDBTest, PadTrees)
{
    SideEffectTrackingDB db(first_nullifier, mock_merkle_db, mock_tracker);

    EXPECT_CALL(mock_merkle_db, pad_trees());

    db.pad_trees();
}

} // namespace
} // namespace bb::avm2::simulation
