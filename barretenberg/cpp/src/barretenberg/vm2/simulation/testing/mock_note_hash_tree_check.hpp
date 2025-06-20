#pragma once

#include <gmock/gmock.h>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/note_hash_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/note_hash_tree_check.hpp"

namespace bb::avm2::simulation {

class MockNoteHashTreeCheck : public NoteHashTreeCheckInterface {
  public:
    MockNoteHashTreeCheck();
    ~MockNoteHashTreeCheck() override;

    MOCK_METHOD(void,
                assert_read,
                (const FF& note_hash,
                 index_t leaf_index,
                 std::span<const FF> sibling_path,
                 const AppendOnlyTreeSnapshot& snapshot),
                (override));

    MOCK_METHOD(FF, get_first_nullifier, (), (const, override));

    MOCK_METHOD(AppendOnlyTreeSnapshot,
                append_note_hash,
                (const FF& note_hash,
                 AztecAddress contract_address,
                 uint64_t note_hash_counter,
                 std::span<const FF> sibling_path,
                 const AppendOnlyTreeSnapshot& prev_snapshot),
                (override));

    MOCK_METHOD(AppendOnlyTreeSnapshot,
                append_siloed_note_hash,
                (const FF& siloed_note_hash,
                 uint64_t note_hash_counter,
                 std::span<const FF> sibling_path,
                 const AppendOnlyTreeSnapshot& prev_snapshot),
                (override));

    MOCK_METHOD(AppendOnlyTreeSnapshot,
                append_unique_note_hash,
                (const FF& unique_note_hash,
                 uint64_t note_hash_counter,
                 std::span<const FF> sibling_path,
                 const AppendOnlyTreeSnapshot& prev_snapshot),
                (override));

    MOCK_METHOD(void, create_checkpoint, (), (override));
    MOCK_METHOD(void, commit_checkpoint, (), (override));
    MOCK_METHOD(void, restore_checkpoint, (), (override));
};

} // namespace bb::avm2::simulation
