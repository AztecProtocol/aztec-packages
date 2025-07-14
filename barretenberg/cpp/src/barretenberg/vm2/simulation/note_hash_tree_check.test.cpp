#include "barretenberg/vm2/simulation/note_hash_tree_check.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/crypto/merkle_tree/memory_tree.hpp"
#include "barretenberg/vm2/simulation/events/note_hash_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/poseidon2.hpp"
#include "barretenberg/vm2/simulation/testing/mock_merkle_check.hpp"
#include "barretenberg/vm2/simulation/testing/mock_poseidon2.hpp"
#include "barretenberg/vm2/testing/macros.hpp"

namespace bb::avm2::simulation {

using ::testing::_;
using ::testing::AllOf;
using ::testing::ElementsAre;
using ::testing::Field;
using ::testing::Return;
using ::testing::StrictMock;

using RawPoseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

namespace {

TEST(AvmSimulationNoteHashTree, Exists)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;

    EventEmitter<NoteHashTreeCheckEvent> event_emitter;
    NoteHashTreeCheck note_hash_tree_check(1, poseidon2, merkle_check, event_emitter);

    std::vector<FF> sibling_path = { 1, 2, 3, 4, 5 };
    AppendOnlyTreeSnapshot snapshot = {
        .root = 123456,
        .nextAvailableLeafIndex = 128,
    };

    FF note_hash = 42;
    index_t leaf_index = 30;

    EXPECT_CALL(merkle_check, assert_membership(note_hash, leaf_index, _, snapshot.root)).WillRepeatedly(Return());

    EXPECT_TRUE(note_hash_tree_check.note_hash_exists(note_hash, note_hash, leaf_index, sibling_path, snapshot));
    EXPECT_FALSE(note_hash_tree_check.note_hash_exists(27, note_hash, leaf_index, sibling_path, snapshot));
    EXPECT_THAT(event_emitter.dump_events(),
                ElementsAre(
                    NoteHashTreeReadWriteEvent{
                        .note_hash = note_hash,
                        .existing_leaf_value = note_hash,
                        .leaf_index = leaf_index,
                        .prev_snapshot = snapshot,
                    },
                    NoteHashTreeReadWriteEvent{
                        .note_hash = 27,
                        .existing_leaf_value = note_hash,
                        .leaf_index = leaf_index,
                        .prev_snapshot = snapshot,
                    }));
}

TEST(AvmSimulationNoteHashTree, WriteUnique)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;

    EventEmitter<NoteHashTreeCheckEvent> event_emitter;
    NoteHashTreeCheck note_hash_tree_check(1, poseidon2, merkle_check, event_emitter);

    std::vector<FF> sibling_path = { 1, 2, 3, 4, 5 };
    AppendOnlyTreeSnapshot snapshot = {
        .root = 123456,
        .nextAvailableLeafIndex = 128,
    };
    FF note_hash = 42;
    uint64_t note_hash_counter = 10;
    FF next_root = 234567;

    EXPECT_CALL(merkle_check, write(FF(0), note_hash, snapshot.nextAvailableLeafIndex, _, snapshot.root))
        .WillOnce(Return(next_root));

    AppendOnlyTreeSnapshot next_snapshot =
        note_hash_tree_check.append_unique_note_hash(note_hash, note_hash_counter, sibling_path, snapshot);

    EXPECT_EQ(next_snapshot.nextAvailableLeafIndex, snapshot.nextAvailableLeafIndex + 1);
    NoteHashTreeReadWriteEvent expect_event = { .note_hash = note_hash,
                                                .leaf_index = snapshot.nextAvailableLeafIndex,
                                                .prev_snapshot = snapshot,
                                                .append_data = NoteHashAppendData{
                                                    .note_hash_counter = note_hash_counter,
                                                    .next_snapshot = next_snapshot,
                                                } };
    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));
}

TEST(AvmSimulationNoteHashTree, WriteSiloed)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;

    EventEmitter<NoteHashTreeCheckEvent> event_emitter;
    FF first_nullifier = 1;
    NoteHashTreeCheck note_hash_tree_check(first_nullifier, poseidon2, merkle_check, event_emitter);

    std::vector<FF> sibling_path = { 1, 2, 3, 4, 5 };
    AppendOnlyTreeSnapshot snapshot = {
        .root = 123456,
        .nextAvailableLeafIndex = 128,
    };
    FF siloed_note_hash = 42;
    uint64_t note_hash_counter = 10;
    FF nonce = 43;
    FF unique_note_hash = 44;

    FF next_root = 234567;

    std::vector<FF> nonce_hash_inputs = { GENERATOR_INDEX__NOTE_HASH_NONCE, first_nullifier, note_hash_counter };
    EXPECT_CALL(poseidon2, hash(nonce_hash_inputs)).WillOnce(Return(nonce));

    std::vector<FF> unique_note_hash_inputs = { GENERATOR_INDEX__UNIQUE_NOTE_HASH, nonce, siloed_note_hash };
    EXPECT_CALL(poseidon2, hash(unique_note_hash_inputs)).WillOnce(Return(unique_note_hash));

    EXPECT_CALL(merkle_check, write(FF(0), unique_note_hash, snapshot.nextAvailableLeafIndex, _, snapshot.root))
        .WillOnce(Return(next_root));

    AppendOnlyTreeSnapshot next_snapshot =
        note_hash_tree_check.append_siloed_note_hash(siloed_note_hash, note_hash_counter, sibling_path, snapshot);

    EXPECT_EQ(next_snapshot.nextAvailableLeafIndex, snapshot.nextAvailableLeafIndex + 1);
    NoteHashTreeReadWriteEvent expect_event = { .note_hash = siloed_note_hash,
                                                .leaf_index = snapshot.nextAvailableLeafIndex,
                                                .prev_snapshot = snapshot,
                                                .append_data = NoteHashAppendData{
                                                    .uniqueness_data =
                                                        NoteHashUniquenessData{
                                                            .nonce = nonce,
                                                            .unique_note_hash = unique_note_hash,
                                                            .first_nullifier = first_nullifier,
                                                        },
                                                    .note_hash_counter = note_hash_counter,
                                                    .next_snapshot = next_snapshot,
                                                } };
    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));
}

TEST(AvmSimulationNoteHashTree, WriteRaw)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;

    EventEmitter<NoteHashTreeCheckEvent> event_emitter;
    FF first_nullifier = 1;
    NoteHashTreeCheck note_hash_tree_check(first_nullifier, poseidon2, merkle_check, event_emitter);

    std::vector<FF> sibling_path = { 1, 2, 3, 4, 5 };
    AppendOnlyTreeSnapshot snapshot = {
        .root = 123456,
        .nextAvailableLeafIndex = 128,
    };

    FF raw_note_hash = 37;

    AztecAddress contract_address = AztecAddress(27);
    FF siloed_note_hash = 42;

    uint64_t note_hash_counter = 10;
    FF nonce = 43;
    FF unique_note_hash = 44;

    FF next_root = 234567;

    std::vector<FF> siloed_note_hash_inputs = { GENERATOR_INDEX__SILOED_NOTE_HASH, contract_address, raw_note_hash };
    EXPECT_CALL(poseidon2, hash(siloed_note_hash_inputs)).WillOnce(Return(siloed_note_hash));

    std::vector<FF> nonce_hash_inputs = { GENERATOR_INDEX__NOTE_HASH_NONCE, first_nullifier, note_hash_counter };
    EXPECT_CALL(poseidon2, hash(nonce_hash_inputs)).WillOnce(Return(nonce));

    std::vector<FF> unique_note_hash_inputs = { GENERATOR_INDEX__UNIQUE_NOTE_HASH, nonce, siloed_note_hash };
    EXPECT_CALL(poseidon2, hash(unique_note_hash_inputs)).WillOnce(Return(unique_note_hash));

    EXPECT_CALL(merkle_check, write(FF(0), unique_note_hash, snapshot.nextAvailableLeafIndex, _, snapshot.root))
        .WillOnce(Return(next_root));

    AppendOnlyTreeSnapshot next_snapshot = note_hash_tree_check.append_note_hash(
        raw_note_hash, contract_address, note_hash_counter, sibling_path, snapshot);

    EXPECT_EQ(next_snapshot.nextAvailableLeafIndex, snapshot.nextAvailableLeafIndex + 1);
    NoteHashTreeReadWriteEvent expect_event = { .note_hash = raw_note_hash,
                                                .leaf_index = snapshot.nextAvailableLeafIndex,
                                                .prev_snapshot = snapshot,
                                                .append_data = NoteHashAppendData{
                                                    .siloing_data =
                                                        NoteHashSiloingData{
                                                            .siloed_note_hash = siloed_note_hash,
                                                            .address = contract_address,
                                                        },
                                                    .uniqueness_data =
                                                        NoteHashUniquenessData{
                                                            .nonce = nonce,
                                                            .unique_note_hash = unique_note_hash,
                                                            .first_nullifier = first_nullifier,
                                                        },
                                                    .note_hash_counter = note_hash_counter,
                                                    .next_snapshot = next_snapshot,
                                                } };
    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));
}

TEST(AvmSimulationNoteHashTree, CheckpointListener)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;

    EventEmitter<NoteHashTreeCheckEvent> event_emitter;
    NoteHashTreeCheck note_hash_tree_check(1, poseidon2, merkle_check, event_emitter);

    note_hash_tree_check.on_checkpoint_created();
    note_hash_tree_check.on_checkpoint_committed();
    note_hash_tree_check.on_checkpoint_reverted();
    EXPECT_THAT(event_emitter.get_events().size(), 3);
    EXPECT_THAT(event_emitter.dump_events(),
                ElementsAre(CheckPointEventType::CREATE_CHECKPOINT,
                            CheckPointEventType::COMMIT_CHECKPOINT,
                            CheckPointEventType::REVERT_CHECKPOINT));
}

} // namespace

} // namespace bb::avm2::simulation
