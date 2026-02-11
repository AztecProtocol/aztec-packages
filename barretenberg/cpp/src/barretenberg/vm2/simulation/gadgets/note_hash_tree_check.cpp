#include "barretenberg/vm2/simulation/gadgets/note_hash_tree_check.hpp"

namespace bb::avm2::simulation {

/**
 * @brief Checks whether a note hash exists in the note hash tree via Merkle membership proof.
 *
 * Verifies that @p leaf_value is present at @p leaf_index in the tree whose root is given by
 * @p snapshot, then compares it against the claimed @p unique_note_hash.
 *
 * @note This function does not validate that @p leaf_index is within the bounds of the tree
 * nor that it is less than the next available leaf index.
 *
 * @param unique_note_hash The unique note hash the caller claims to exist.
 * @param leaf_value The actual leaf value retrieved from the tree.
 * @param leaf_index The index of the leaf in the tree.
 * @param sibling_path The Merkle sibling path used for the membership proof.
 * @param snapshot The tree snapshot (root + size) to verify against.
 * @return true if @p unique_note_hash equals @p leaf_value, false otherwise.
 */
bool NoteHashTreeCheck::note_hash_exists(const FF& unique_note_hash,
                                         const FF& leaf_value,
                                         uint64_t leaf_index,
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

/**
 * @brief Computes the siloed note hash by hashing the contract address with the note hash.
 *
 * Siloing binds a note hash to its originating contract, preventing cross-contract collisions.
 * Uses Poseidon2 with a domain separator for siloed note hashes.
 *
 * @param contract_address The address of the contract that created the note.
 * @param note_hash The original (inner) note hash.
 * @return The siloed note hash: Poseidon2(DOM_SEP__SILOED_NOTE_HASH, contract_address, note_hash).
 */
FF NoteHashTreeCheck::make_siloed(AztecAddress contract_address, const FF& note_hash) const
{
    return poseidon2.hash({ DOM_SEP__SILOED_NOTE_HASH, contract_address, note_hash });
}

/**
 * @brief Derives a nonce for a note hash from the transaction's first nullifier and the note hash counter.
 *
 * The nonce ensures uniqueness of note hashes within and across transactions.
 *
 * @param note_hash_counter The index of the note hash in the transaction.
 * @return The nonce: Poseidon2(DOM_SEP__NOTE_HASH_NONCE, first_nullifier, note_hash_counter).
 */
FF NoteHashTreeCheck::make_nonce(uint64_t note_hash_counter) const
{
    return poseidon2.hash({ DOM_SEP__NOTE_HASH_NONCE, first_nullifier, note_hash_counter });
}

/**
 * @brief Computes a unique note hash by combining a siloed note hash with its nonce.
 *
 * This final transformation guarantees global uniqueness of the note hash.
 *
 * @param siloed_note_hash The siloed note hash (already bound to a contract).
 * @param nonce The nonce derived from the first nullifier and note hash counter.
 * @return The unique note hash: Poseidon2(DOM_SEP__UNIQUE_NOTE_HASH, nonce, siloed_note_hash).
 */
FF NoteHashTreeCheck::make_unique(const FF& siloed_note_hash, const FF& nonce) const
{
    return poseidon2.hash({ DOM_SEP__UNIQUE_NOTE_HASH, nonce, siloed_note_hash });
}

/**
 * @brief Appends a raw (inner) note hash to the tree after siloing and making it unique.
 *
 * This is the standard entry point for user-space note hash insertion. The note hash is first
 * siloed with the contract address, then made unique using a nonce derived from the first
 * nullifier and the note hash counter, before being inserted into the tree.
 *
 * @param note_hash The raw (inner) note hash to append.
 * @param contract_address The address of the contract that created the note.
 * @param note_hash_counter A counter distinguishing this note hash within the transaction.
 * @param sibling_path The Merkle sibling path for the append operation.
 * @param prev_snapshot The tree snapshot before the append.
 * @return The updated tree snapshot after inserting the new leaf.
 */
AppendOnlyTreeSnapshot NoteHashTreeCheck::append_note_hash(const FF& note_hash,
                                                           AztecAddress contract_address,
                                                           uint64_t note_hash_counter,
                                                           std::span<const FF> sibling_path,
                                                           const AppendOnlyTreeSnapshot& prev_snapshot)
{
    return append_note_hash_internal(
        note_hash, contract_address, /*should_make_unique=*/true, note_hash_counter, sibling_path, prev_snapshot);
}

/**
 * @brief Appends a pre-siloed note hash to the tree after making it unique.
 *
 * Skips the siloing step (the note hash is already bound to a contract) but still derives a
 * nonce and computes the unique note hash before insertion.
 *
 * @param siloed_note_hash The already-siloed note hash to append.
 * @param note_hash_counter A counter distinguishing this note hash within the transaction.
 * @param sibling_path The Merkle sibling path for the append operation.
 * @param prev_snapshot The tree snapshot before the append.
 * @return The updated tree snapshot after inserting the new leaf.
 */
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

/**
 * @brief Appends a pre-computed unique note hash directly to the tree.
 *
 * Skips both siloing and uniqueness derivation -- the note hash is inserted as-is. This is
 * used when the caller has already performed all transformations externally.
 *
 * @param unique_note_hash The fully-unique note hash to append.
 * @param note_hash_counter A counter distinguishing this note hash within the transaction.
 * @param sibling_path The Merkle sibling path for the append operation.
 * @param prev_snapshot The tree snapshot before the append.
 * @return The updated tree snapshot after inserting the new leaf.
 */
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

/**
 * @brief Internal implementation for all note hash append variants.
 *
 * Optionally silos and/or makes the note hash unique before inserting it as a new leaf at the
 * next available index. Performs a Merkle write (replacing a zero leaf) and emits a
 * read/write event capturing all intermediate data for constraint generation.
 *
 * @param note_hash The note hash to insert (may be raw, siloed, or unique depending on caller).
 * @param contract_address If present, the note hash is siloed with this address before insertion.
 * @param should_make_unique If true, a nonce is derived and the note hash is made unique.
 * @param note_hash_counter A counter distinguishing this note hash within the transaction.
 * @param sibling_path The Merkle sibling path for the append operation.
 * @param prev_snapshot The tree snapshot before the append.
 * @return The updated tree snapshot after inserting the new leaf.
 */
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
        merkle_check.write(0, note_hash, prev_snapshot.next_available_leaf_index, sibling_path, prev_snapshot.root);
    AppendOnlyTreeSnapshot next_snapshot = AppendOnlyTreeSnapshot{
        .root = next_root,
        .next_available_leaf_index = prev_snapshot.next_available_leaf_index + 1,
    };
    events.emit(NoteHashTreeReadWriteEvent{ .note_hash = original_note_hash,
                                            .existing_leaf_value = 0,
                                            .leaf_index = prev_snapshot.next_available_leaf_index,
                                            .prev_snapshot = prev_snapshot,
                                            .append_data = NoteHashAppendData{
                                                .siloing_data = siloing_data,
                                                .uniqueness_data = uniqueness_data,
                                                .note_hash_counter = note_hash_counter,
                                                .next_snapshot = next_snapshot,
                                            } });
    return next_snapshot;
}

/** @brief Emits a checkpoint creation event for the note hash tree. */
void NoteHashTreeCheck::on_checkpoint_created()
{
    events.emit(CheckPointEventType::CREATE_CHECKPOINT);
}

/** @brief Emits a checkpoint commit event, finalizing pending note hash tree changes. */
void NoteHashTreeCheck::on_checkpoint_committed()
{
    events.emit(CheckPointEventType::COMMIT_CHECKPOINT);
}

/** @brief Emits a checkpoint revert event, rolling back pending note hash tree changes. */
void NoteHashTreeCheck::on_checkpoint_reverted()
{
    events.emit(CheckPointEventType::REVERT_CHECKPOINT);
}

} // namespace bb::avm2::simulation
