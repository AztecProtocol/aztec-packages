#include "barretenberg/vm2/simulation/gadgets/indexed_tree_check.hpp"

#include <stdexcept>

namespace bb::avm2::simulation {

/**
 * @brief Computes the siloed value by hashing the separator, address, and value via Poseidon2.
 *
 * Siloing binds a value to its originating contract, preventing cross-contract collisions.
 *
 * @param value The original (inner) value.
 * @param siloing_params The siloing parameters (address and domain separator).
 * @return The siloed value: Poseidon2(separator, address, value).
 */
FF IndexedTreeCheck::silo(const FF& value, IndexedTreeSiloingParameters siloing_params)
{
    return poseidon2.hash({ siloing_params.siloing_separator, siloing_params.address, value });
}

/**
 * @brief Validates the low leaf preimage against the target value for membership/non-membership.
 *
 * In an indexed tree, the low leaf contains the largest value less than the target value.
 * This function validates the low leaf properties to prove either membership (when the low leaf value
 * equals the value) or non-membership (when the value falls between the low leaf value and its
 * next value). Note that the presence of the low leaf in the tree needs to be proven separately.
 *
 * For membership ( @p exists = true ): the low leaf value must equal @p value.
 * For non-membership ( @p exists = false ): @p value must be greater than the low leaf value,
 * and (if next_value != 0) less than the low leaf next_value.
 *
 * @param value The (possibly siloed) value being checked.
 * @param low_leaf_preimage The preimage of the low leaf in the indexed tree.
 * @param exists True if proving membership, false if proving non-membership.
 * @throws std::runtime_error If validation fails.
 */
void IndexedTreeCheck::validate_low_leaf(const FF& value, const IndexedTreeLeafData& low_leaf_preimage, bool exists)
{
    bool low_leaf_matches = low_leaf_preimage.value == value;
    // We base the checking on whether the low leaf matches instead of exists, to match PIL behavior.
    if (low_leaf_matches) {
        if (!exists) {
            throw std::runtime_error("Indexed tree non-membership check failed");
        }
    } else {
        if (!field_gt.ff_gt(value, low_leaf_preimage.value)) {
            throw std::runtime_error("Low leaf value is GTE leaf value");
        }
        if (low_leaf_preimage.next_value != 0 && !field_gt.ff_gt(low_leaf_preimage.next_value, value)) {
            throw std::runtime_error("Leaf value is GTE low leaf next value");
        }
        if (exists) {
            throw std::runtime_error("Indexed tree membership check failed");
        }
    }
}

/**
 * @brief Performs a membership/non-membership read check on an indexed tree.
 *
 * Verifies whether a value exists or does not exist in a given indexed tree at a given snapshot,
 * using the low leaf membership proof technique. The value is optionally siloed before checking.
 *
 * The low leaf is proven to be a member of the tree via Merkle proof, then validated against
 * the target value according to indexed tree invariants (see validate_low_leaf).
 *
 * @param source_value The raw (possibly unsiloed) value to check.
 * @param siloing_params If present, the value is siloed with this address and separator before checking.
 * @param exists True to prove membership, false to prove non-membership.
 * @param low_leaf_preimage The preimage of the low leaf.
 * @param low_leaf_index The index of the low leaf in the tree.
 * @param sibling_path The Merkle sibling path for the low leaf.
 * @param snapshot The tree snapshot to verify against.
 * @throws std::runtime_error If validation fails.
 */
void IndexedTreeCheck::assert_read(const FF& source_value,
                                   std::optional<IndexedTreeSiloingParameters> siloing_params,
                                   bool exists,
                                   const IndexedTreeLeafData& low_leaf_preimage,
                                   uint64_t low_leaf_index,
                                   std::span<const FF> sibling_path,
                                   const AppendOnlyTreeSnapshot& snapshot)
{
    FF value = source_value;
    std::optional<IndexedLeafSiloingData> siloing_data = std::nullopt;
    if (siloing_params.has_value()) {
        value = silo(value, siloing_params.value());
        siloing_data = IndexedLeafSiloingData{
            .siloed_value = value,
            .parameters = siloing_params.value(),
        };
    }
    // Low leaf membership
    FF low_leaf_hash = poseidon2.hash(low_leaf_preimage.get_hash_inputs());
    merkle_check.assert_membership(
        merkle_hash_domain_separator, low_leaf_hash, low_leaf_index, sibling_path, snapshot.root);

    // Low leaf and value validation
    validate_low_leaf(value, low_leaf_preimage, exists);

    events.emit(IndexedTreeReadWriteEvent{
        .value = source_value,
        .prev_snapshot = snapshot,
        .next_snapshot = snapshot,
        .tree_height = sibling_path.size(),
        .merkle_hash_separator = FF(merkle_hash_domain_separator),
        .low_leaf_data = low_leaf_preimage,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
        .siloing_data = siloing_data,
    });
}

/**
 * @brief Writes a value into an indexed tree, or validates it already exists.
 *
 * Handles both new insertions and duplicate writes. If the value already exists in the tree
 * ( @p insertion_sibling_path is nullopt), it validates membership. Otherwise, it performs an
 * indexed tree insertion by updating the low leaf's next pointer and appending the new leaf.
 *
 * The value is optionally siloed before insertion. The low leaf is validated via indexed tree
 * invariants. For a new insertion, two Merkle writes occur:
 * 1. Update the low leaf to point to the new value.
 * 2. Insert the new leaf at the next available index.
 *
 * @param source_value The raw (possibly unsiloed) value to insert.
 * @param siloing_params If present, the value is siloed with these parameters before insertion.
 * @param public_inputs_index If present, the index into public inputs for this write.
 * @param low_leaf_preimage The preimage of the low leaf.
 * @param low_leaf_index The index of the low leaf in the tree.
 * @param low_leaf_sibling_path The Merkle sibling path for the low leaf.
 * @param prev_snapshot The tree snapshot before the write.
 * @param insertion_sibling_path If present, the sibling path for inserting a new leaf. If nullopt,
 *        the value already exists and no insertion occurs.
 * @return The updated tree snapshot after the write (unchanged if value already exists).
 * @throws std::runtime_error If validation fails.
 */
AppendOnlyTreeSnapshot IndexedTreeCheck::write(const FF& source_value,
                                               std::optional<IndexedTreeSiloingParameters> siloing_params,
                                               std::optional<uint64_t> public_inputs_index,
                                               const IndexedTreeLeafData& low_leaf_preimage,
                                               uint64_t low_leaf_index,
                                               std::span<const FF> low_leaf_sibling_path,
                                               const AppendOnlyTreeSnapshot& prev_snapshot,
                                               std::optional<std::span<const FF>> insertion_sibling_path)
{
    FF value = source_value;
    std::optional<IndexedLeafSiloingData> siloing_data = std::nullopt;
    if (siloing_params.has_value()) {
        value = silo(value, siloing_params.value());
        siloing_data = IndexedLeafSiloingData{ .siloed_value = value, .parameters = siloing_params.value() };
    }
    bool exists = !insertion_sibling_path.has_value();

    // Low leaf validation
    validate_low_leaf(value, low_leaf_preimage, exists);

    AppendOnlyTreeSnapshot next_snapshot = prev_snapshot;
    std::optional<IndexedLeafAppendData> append_data = std::nullopt;

    FF low_leaf_hash = poseidon2.hash(low_leaf_preimage.get_hash_inputs());

    if (exists) {
        merkle_check.assert_membership(
            merkle_hash_domain_separator, low_leaf_hash, low_leaf_index, low_leaf_sibling_path, prev_snapshot.root);
    } else {
        // Low leaf update
        IndexedTreeLeafData updated_low_leaf_preimage = low_leaf_preimage;
        updated_low_leaf_preimage.next_index = prev_snapshot.next_available_leaf_index;
        updated_low_leaf_preimage.next_value = value;
        FF updated_low_leaf_hash = poseidon2.hash(updated_low_leaf_preimage.get_hash_inputs());

        FF intermediate_root = merkle_check.write(merkle_hash_domain_separator,
                                                  low_leaf_hash,
                                                  updated_low_leaf_hash,
                                                  low_leaf_index,
                                                  low_leaf_sibling_path,
                                                  prev_snapshot.root);

        // Insertion
        IndexedTreeLeafData new_leaf_preimage = {
            .value = value,
            .next_value = low_leaf_preimage.next_value,
            .next_index = low_leaf_preimage.next_index,
        };

        FF new_leaf_hash = poseidon2.hash(new_leaf_preimage.get_hash_inputs());

        FF write_root = merkle_check.write(merkle_hash_domain_separator,
                                           FF(0),
                                           new_leaf_hash,
                                           prev_snapshot.next_available_leaf_index,
                                           insertion_sibling_path.value(),
                                           intermediate_root);

        next_snapshot = AppendOnlyTreeSnapshot{
            .root = write_root,
            .next_available_leaf_index = prev_snapshot.next_available_leaf_index + 1,
        };
        append_data = IndexedLeafAppendData{
            .updated_low_leaf_hash = updated_low_leaf_hash,
            .new_leaf_hash = new_leaf_hash,
            .intermediate_root = intermediate_root,
        };
    }

    events.emit(IndexedTreeReadWriteEvent{ .value = source_value,
                                           .prev_snapshot = prev_snapshot,
                                           .next_snapshot = next_snapshot,
                                           .tree_height = low_leaf_sibling_path.size(),
                                           .merkle_hash_separator = FF(merkle_hash_domain_separator),
                                           .low_leaf_data = low_leaf_preimage,
                                           .low_leaf_hash = low_leaf_hash,
                                           .low_leaf_index = low_leaf_index,
                                           .write = true,
                                           .siloing_data = siloing_data,
                                           .public_inputs_index = public_inputs_index,
                                           .append_data = append_data });

    return next_snapshot;
}

/** @brief Emits a checkpoint creation event for the indexed tree. */
void IndexedTreeCheck::on_checkpoint_created()
{
    events.emit(CheckPointEventType::CREATE_CHECKPOINT);
}

/** @brief Emits a checkpoint commit event, finalizing pending indexed tree changes. */
void IndexedTreeCheck::on_checkpoint_committed()
{
    events.emit(CheckPointEventType::COMMIT_CHECKPOINT);
}

/** @brief Emits a checkpoint revert event, rolling back pending indexed tree changes. */
void IndexedTreeCheck::on_checkpoint_reverted()
{
    events.emit(CheckPointEventType::REVERT_CHECKPOINT);
}

} // namespace bb::avm2::simulation
