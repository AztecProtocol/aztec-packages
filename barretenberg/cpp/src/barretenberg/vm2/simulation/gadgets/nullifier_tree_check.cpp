#include "barretenberg/vm2/simulation/gadgets/nullifier_tree_check.hpp"

#include "barretenberg/vm2/common/constants.hpp"

#include <stdexcept>

namespace bb::avm2::simulation {

/**
 * @brief Computes the siloed nullifier by hashing the contract address with the nullifier.
 *
 * Siloing binds a nullifier to its originating contract, preventing cross-contract collisions.
 * Uses Poseidon2 with a domain separator for siloed nullifiers.
 *
 * @param nullifier The original (inner) nullifier.
 * @param contract_address The address of the contract that created the nullifier.
 * @return The siloed nullifier: Poseidon2(DOM_SEP__SILOED_NULLIFIER, contract_address, nullifier).
 */
FF NullifierTreeCheck::silo_nullifier(const FF& nullifier, AztecAddress contract_address)
{
    return poseidon2.hash({ DOM_SEP__SILOED_NULLIFIER, contract_address, nullifier });
}

/**
 * @brief Validates the low leaf preimage against the nullifier for membership/non-membership checks.
 *
 * In an indexed nullifier tree, the low leaf contains the largest nullifier less than the target nullifier.
 * This function validates the low leaf properties to prove either membership (when the low leaf nullifier
 * equals the nullifier) or non-membership (when the nullifier falls between the low leaf nullifier and its
 * next key). Note that the presence of the low leaf in the tree needs to be proven separately.
 *
 * For membership ( @p exists = true ): the low leaf's nullifier must equal @p nullifier.
 * For non-membership ( @p exists = false ): the nullifier must be greater than the low leaf's
 * nullifier and (if nextKey != 0) less than the low leaf's nextKey.
 *
 * @param nullifier The (possibly siloed) nullifier being checked.
 * @param low_leaf_preimage The preimage of the low leaf in the nullifier tree.
 * @param exists True if proving membership, false if proving non-membership.
 * @throws std::runtime_error If validation fails (e.g., membership check when low leaf doesn't match).
 */
void NullifierTreeCheck::validate_low_leaf(const FF& nullifier,
                                           const NullifierTreeLeafPreimage& low_leaf_preimage,
                                           bool exists)
{
    bool low_leaf_matches = low_leaf_preimage.leaf.nullifier == nullifier;
    // We base the checking on whether the low leaf matches instead of exists, to match PIL behavior.
    if (low_leaf_matches) {
        if (!exists) {
            throw std::runtime_error("Nullifier non-membership check failed");
        }
    } else {
        if (!field_gt.ff_gt(nullifier, low_leaf_preimage.leaf.nullifier)) {
            throw std::runtime_error("Low leaf value is GTE leaf value");
        }
        if (low_leaf_preimage.nextKey != 0 && !field_gt.ff_gt(low_leaf_preimage.nextKey, nullifier)) {
            throw std::runtime_error("Leaf value is GTE low leaf next value");
        }
        if (exists) {
            throw std::runtime_error("Nullifier membership check failed");
        }
    }
}

/**
 * @brief Performs a nullifier membership/non-membership check on the nullifier tree.
 *
 * This method verifies whether a nullifier exists or does not exist in the nullifier tree at a
 * given snapshot, using the indexed tree low-leaf membership proof technique. It optionally silos
 * the nullifier with a contract address before checking.
 *
 * The low leaf must be proven to be a member of the tree via Merkle proof. Then the nullifier is
 * validated against the low leaf according to the indexed tree invariants (see validate_low_leaf).
 *
 * @param source_nullifier The raw (possibly unsiloed) nullifier to check.
 * @param contract_address If present, the nullifier is siloed with this address before checking.
 * @param exists True to prove membership, false to prove non-membership.
 * @param low_leaf_preimage The preimage of the low leaf for the nullifier.
 * @param low_leaf_index The index of the low leaf in the tree.
 * @param sibling_path The Merkle sibling path for the low leaf.
 * @param snapshot The tree snapshot to verify against.
 * @throws std::runtime_error If validation fails.
 */
void NullifierTreeCheck::assert_read(const FF& source_nullifier,
                                     std::optional<AztecAddress> contract_address,
                                     bool exists,
                                     const NullifierTreeLeafPreimage& low_leaf_preimage,
                                     uint64_t low_leaf_index,
                                     std::span<const FF> sibling_path,
                                     const AppendOnlyTreeSnapshot& snapshot)
{
    FF nullifier = source_nullifier;
    std::optional<NullifierSiloingData> siloing_data = std::nullopt;
    if (contract_address.has_value()) {
        nullifier = silo_nullifier(nullifier, contract_address.value());
        siloing_data = NullifierSiloingData{ .siloed_nullifier = nullifier, .address = contract_address.value() };
    }
    // Low leaf membership
    FF low_leaf_hash = poseidon2.hash(low_leaf_preimage.get_hash_inputs());
    merkle_check.assert_membership(low_leaf_hash, low_leaf_index, sibling_path, snapshot.root);

    // Low leaf and value validation
    validate_low_leaf(nullifier, low_leaf_preimage, exists);

    events.emit(NullifierTreeReadWriteEvent{
        .nullifier = source_nullifier,
        .prev_snapshot = snapshot,
        .next_snapshot = snapshot,
        .low_leaf_preimage = low_leaf_preimage,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
        .siloing_data = siloing_data,
    });
}

/**
 * @brief Inserts a nullifier into the nullifier tree or verifies it already exists.
 *
 * This method handles both successful and failing nullifier writes. If the nullifier already
 * exists in the tree ( @p insertion_sibling_path is nullopt ), it validates membership. Otherwise,
 * it performs an indexed tree insertion by updating the low leaf's next pointer and appending the
 * new nullifier as a leaf.
 *
 * The nullifier is optionally siloed with a contract address before insertion. The low leaf must
 * be validated via indexed tree invariants. For a new insertion, two Merkle writes occur:
 * 1. Update the low leaf to point to the new nullifier.
 * 2. Insert the new nullifier leaf at the next available index.
 *
 * @param source_nullifier The raw (possibly unsiloed) nullifier to insert.
 * @param contract_address If present, the nullifier is siloed with this address before insertion.
 * @param nullifier_counter The index of the nullifier within this transaction.
 * @param low_leaf_preimage The preimage of the low leaf for the nullifier.
 * @param low_leaf_index The index of the low leaf in the tree.
 * @param low_leaf_sibling_path The Merkle sibling path for the low leaf.
 * @param prev_snapshot The tree snapshot before the write.
 * @param insertion_sibling_path If present, the sibling path for inserting a new leaf. If nullopt,
 *        the nullifier already exists and no insertion occurs.
 * @return The updated tree snapshot after the write (unchanged if nullifier already exists).
 * @throws std::runtime_error If validation fails.
 */
AppendOnlyTreeSnapshot NullifierTreeCheck::write(const FF& source_nullifier,
                                                 std::optional<AztecAddress> contract_address,
                                                 uint64_t nullifier_counter,
                                                 const NullifierTreeLeafPreimage& low_leaf_preimage,
                                                 uint64_t low_leaf_index,
                                                 std::span<const FF> low_leaf_sibling_path,
                                                 const AppendOnlyTreeSnapshot& prev_snapshot,
                                                 std::optional<std::span<const FF>> insertion_sibling_path)
{
    FF nullifier = source_nullifier;
    std::optional<NullifierSiloingData> siloing_data = std::nullopt;
    if (contract_address.has_value()) {
        nullifier = silo_nullifier(nullifier, contract_address.value());
        siloing_data = NullifierSiloingData{ .siloed_nullifier = nullifier, .address = contract_address.value() };
    }
    bool exists = !insertion_sibling_path.has_value();

    // Low leaf validation
    validate_low_leaf(nullifier, low_leaf_preimage, exists);

    AppendOnlyTreeSnapshot next_snapshot = prev_snapshot;
    std::optional<NullifierAppendData> append_data = std::nullopt;

    FF low_leaf_hash = poseidon2.hash(low_leaf_preimage.get_hash_inputs());

    if (exists) {
        merkle_check.assert_membership(low_leaf_hash, low_leaf_index, low_leaf_sibling_path, prev_snapshot.root);
    } else {
        // Low leaf update
        NullifierTreeLeafPreimage updated_low_leaf_preimage = low_leaf_preimage;
        updated_low_leaf_preimage.nextIndex = prev_snapshot.next_available_leaf_index;
        updated_low_leaf_preimage.nextKey = nullifier;
        FF updated_low_leaf_hash = poseidon2.hash(updated_low_leaf_preimage.get_hash_inputs());

        FF intermediate_root = merkle_check.write(
            low_leaf_hash, updated_low_leaf_hash, low_leaf_index, low_leaf_sibling_path, prev_snapshot.root);

        // Insertion
        NullifierTreeLeafPreimage new_leaf_preimage = NullifierTreeLeafPreimage(
            NullifierLeafValue(nullifier), low_leaf_preimage.nextIndex, low_leaf_preimage.nextKey);

        FF new_leaf_hash = poseidon2.hash(new_leaf_preimage.get_hash_inputs());

        FF write_root = merkle_check.write(FF(0),
                                           new_leaf_hash,
                                           prev_snapshot.next_available_leaf_index,
                                           insertion_sibling_path.value(),
                                           intermediate_root);

        next_snapshot = AppendOnlyTreeSnapshot{
            .root = write_root,
            .next_available_leaf_index = prev_snapshot.next_available_leaf_index + 1,
        };
        append_data = NullifierAppendData{
            .updated_low_leaf_hash = updated_low_leaf_hash,
            .new_leaf_hash = new_leaf_hash,
            .intermediate_root = intermediate_root,
        };
    }

    events.emit(NullifierTreeReadWriteEvent{ .nullifier = source_nullifier,
                                             .prev_snapshot = prev_snapshot,
                                             .next_snapshot = next_snapshot,
                                             .low_leaf_preimage = low_leaf_preimage,
                                             .low_leaf_hash = low_leaf_hash,
                                             .low_leaf_index = low_leaf_index,
                                             .write = true,
                                             .siloing_data = siloing_data,
                                             .nullifier_counter = nullifier_counter,
                                             .append_data = append_data });

    return next_snapshot;
}

/** @brief Emits a checkpoint creation event for the nullifier tree. */
void NullifierTreeCheck::on_checkpoint_created()
{
    events.emit(CheckPointEventType::CREATE_CHECKPOINT);
}

/** @brief Emits a checkpoint commit event, finalizing pending nullifier tree changes. */
void NullifierTreeCheck::on_checkpoint_committed()
{
    events.emit(CheckPointEventType::COMMIT_CHECKPOINT);
}

/** @brief Emits a checkpoint revert event, rolling back pending nullifier tree changes. */
void NullifierTreeCheck::on_checkpoint_reverted()
{
    events.emit(CheckPointEventType::REVERT_CHECKPOINT);
}

} // namespace bb::avm2::simulation
