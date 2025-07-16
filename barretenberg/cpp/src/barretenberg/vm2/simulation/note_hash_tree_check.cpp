#include "barretenberg/vm2/simulation/note_hash_tree_check.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/events/note_hash_tree_check_event.hpp"

namespace bb::avm2::simulation {

bool NoteHashTreeCheck::note_hash_exists(const FF& unique_note_hash,
                                         const FF& leaf_value,
                                         index_t leaf_index,
                                         std::span<const FF> sibling_path,
                                         const AppendOnlyTreeSnapshot& snapshot)
{
    merkle_check.assert_membership(leaf_value, leaf_index, sibling_path, snapshot.root);
    events.emit(NoteHashTreeReadWriteEvent{ .note_hash = unique_note_hash,
                                            .existing_leaf_value = leaf_value,
                                            .leaf_index = leaf_index,
                                            .prev_snapshot = snapshot });
    return unique_note_hash == leaf_value;
}

FF NoteHashTreeCheck::make_siloed(AztecAddress contract_address, const FF& note_hash) const
{
    return poseidon2.hash({ GENERATOR_INDEX__SILOED_NOTE_HASH, contract_address, note_hash });
}

FF NoteHashTreeCheck::make_nonce(uint64_t note_hash_counter) const
{
    return poseidon2.hash({ GENERATOR_INDEX__NOTE_HASH_NONCE, first_nullifier, note_hash_counter });
}

FF NoteHashTreeCheck::make_unique(const FF& siloed_note_hash, const FF& nonce) const
{
    return poseidon2.hash({ GENERATOR_INDEX__UNIQUE_NOTE_HASH, nonce, siloed_note_hash });
}

AppendOnlyTreeSnapshot NoteHashTreeCheck::append_note_hash(const FF& note_hash,
                                                           AztecAddress contract_address,
                                                           uint64_t note_hash_counter,
                                                           std::span<const FF> sibling_path,
                                                           const AppendOnlyTreeSnapshot& prev_snapshot)
{
    return append_note_hash_internal(
        note_hash, contract_address, /*should_make_unique=*/true, note_hash_counter, sibling_path, prev_snapshot);
}

AppendOnlyTreeSnapshot NoteHashTreeCheck::append_siloed_note_hash(const FF& siloed_note_hash,
                                                                  uint64_t note_hash_counter,
                                                                  std::span<const FF> sibling_path,
                                                                  const AppendOnlyTreeSnapshot& prev_snapshot)
{
    return append_note_hash_internal(siloed_note_hash,
                                     /* contract_address */ std::nullopt,
                                     /* should_make_unique */ true,
                                     note_hash_counter,
                                     sibling_path,
                                     prev_snapshot);
}

AppendOnlyTreeSnapshot NoteHashTreeCheck::append_unique_note_hash(const FF& unique_note_hash,
                                                                  uint64_t note_hash_counter,
                                                                  std::span<const FF> sibling_path,
                                                                  const AppendOnlyTreeSnapshot& prev_snapshot)
{
    return append_note_hash_internal(unique_note_hash,
                                     /* contract_address */ std::nullopt,
                                     /* should_make_unique */ false,
                                     note_hash_counter,
                                     sibling_path,
                                     prev_snapshot);
}

AppendOnlyTreeSnapshot NoteHashTreeCheck::append_note_hash_internal(FF note_hash,
                                                                    std::optional<AztecAddress> contract_address,
                                                                    bool should_make_unique,
                                                                    uint64_t note_hash_counter,
                                                                    std::span<const FF> sibling_path,
                                                                    const AppendOnlyTreeSnapshot& prev_snapshot)
{
    FF original_note_hash = note_hash;

    std::optional<NoteHashSiloingData> siloing_data = std::nullopt;
    if (contract_address.has_value()) {
        note_hash = make_siloed(*contract_address, note_hash);
        siloing_data = NoteHashSiloingData{ .siloed_note_hash = note_hash, .address = *contract_address };
    }
    std::optional<NoteHashUniquenessData> uniqueness_data = std::nullopt;
    if (should_make_unique) {
        FF nonce = make_nonce(note_hash_counter);
        note_hash = make_unique(note_hash, nonce);
        uniqueness_data =
            NoteHashUniquenessData{ .nonce = nonce, .unique_note_hash = note_hash, .first_nullifier = first_nullifier };
    }

    FF next_root =
        merkle_check.write(0, note_hash, prev_snapshot.nextAvailableLeafIndex, sibling_path, prev_snapshot.root);
    AppendOnlyTreeSnapshot next_snapshot = AppendOnlyTreeSnapshot{
        .root = next_root,
        .nextAvailableLeafIndex = prev_snapshot.nextAvailableLeafIndex + 1,
    };
    events.emit(NoteHashTreeReadWriteEvent{ .note_hash = original_note_hash,
                                            .existing_leaf_value = 0,
                                            .leaf_index = prev_snapshot.nextAvailableLeafIndex,
                                            .prev_snapshot = prev_snapshot,
                                            .append_data = NoteHashAppendData{
                                                .siloing_data = siloing_data,
                                                .uniqueness_data = uniqueness_data,
                                                .note_hash_counter = note_hash_counter,
                                                .next_snapshot = next_snapshot,
                                            } });
    return next_snapshot;
}

void NoteHashTreeCheck::on_checkpoint_created()
{
    events.emit(CheckPointEventType::CREATE_CHECKPOINT);
}

void NoteHashTreeCheck::on_checkpoint_committed()
{
    events.emit(CheckPointEventType::COMMIT_CHECKPOINT);
}

void NoteHashTreeCheck::on_checkpoint_reverted()
{
    events.emit(CheckPointEventType::REVERT_CHECKPOINT);
}

} // namespace bb::avm2::simulation
