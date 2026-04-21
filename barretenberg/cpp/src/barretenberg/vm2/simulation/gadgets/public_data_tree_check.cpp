#include "barretenberg/vm2/simulation/gadgets/public_data_tree_check.hpp"

#include <algorithm>
#include <limits>
#include <stdexcept>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/vm2/simulation/events/checkpoint_event_type.hpp"

namespace bb::avm2::simulation {

/**
 * @brief Compute the siloed leaf slot from a contract address and storage slot.
 *
 * @param contract_address The contract address to silo with.
 * @param slot The storage slot.
 * @return The siloed leaf slot, computed as poseidon2(DOM_SEP__PUBLIC_LEAF_SLOT, contract_address, slot).
 */
FF PublicDataTreeCheck::compute_leaf_slot(const AztecAddress& contract_address, const FF& slot)
{
    return poseidon2.hash({ DOM_SEP__PUBLIC_LEAF_SLOT, contract_address, slot });
}

/**
 * @brief Validate that the low leaf's slot range covers (jumps over) the given leaf slot.
 *
 * Checks that low_leaf.slot < leaf_slot and (low_leaf.next_slot > leaf_slot or next_slot == 0 meaning infinity).
 * This is used to prove non-membership of the leaf slot in the indexed tree.
 *
 * @param low_leaf_preimage The preimage of the low leaf.
 * @param leaf_slot The siloed leaf slot to validate against.
 * @throws std::runtime_error If low leaf slot is >= leaf slot.
 * @throws std::runtime_error If leaf slot is >= low leaf next slot (when next slot is nonzero).
 */
void PublicDataTreeCheck::validate_low_leaf_jumps_over_slot(const PublicDataTreeLeafPreimage& low_leaf_preimage,
                                                            const FF& leaf_slot)
{
    if (!field_gt.ff_gt(leaf_slot, low_leaf_preimage.leaf.slot)) {
        throw std::runtime_error("Low leaf slot is GTE leaf slot");
    }
    // indexed_leaf calls nextKey/nextSlot as nextValue, which is counter intuitive in public data tree
    if (low_leaf_preimage.nextKey != 0 && !field_gt.ff_gt(low_leaf_preimage.nextKey, leaf_slot)) {
        throw std::runtime_error("Leaf slot is GTE low leaf next slot");
    }
}

/**
 * @brief Assert that a public data tree read is valid.
 *
 * Verifies a membership proof for the low leaf, then checks the value:
 * - If the leaf exists (low_leaf.slot == leaf_slot), asserts that the stored value matches.
 * - If the leaf does not exist, validates the low leaf range and asserts value is zero.
 *
 * @param slot The storage slot being read.
 * @param contract_address The contract address to silo the slot with.
 * @param value The expected value at this slot.
 * @param low_leaf_preimage The preimage of the low leaf in the indexed tree.
 * @param low_leaf_index The index of the low leaf in the tree.
 * @param sibling_path The Merkle sibling path for the low leaf.
 * @param snapshot The tree snapshot (root and size) to verify against.
 * @throws std::runtime_error If the leaf value does not match or the non-membership proof fails.
 */
void PublicDataTreeCheck::assert_read(const FF& slot,
                                      const AztecAddress& contract_address,
                                      const FF& value,
                                      const PublicDataTreeLeafPreimage& low_leaf_preimage,
                                      uint64_t low_leaf_index,
                                      std::span<const FF> sibling_path,
                                      const AppendOnlyTreeSnapshot& snapshot)
{
    FF leaf_slot = compute_leaf_slot(contract_address, slot);
    // Low leaf membership
    FF low_leaf_hash = poseidon2.hash(low_leaf_preimage.get_hash_inputs());
    merkle_check.assert_membership(
        DOM_SEP__PUBLIC_DATA_MERKLE, low_leaf_hash, low_leaf_index, sibling_path, snapshot.root);

    // Low leaf and value validation
    bool exists = low_leaf_preimage.leaf.slot == leaf_slot;
    if (exists) {
        if (low_leaf_preimage.leaf.value != value) {
            throw std::runtime_error("Leaf value does not match value");
        }
    } else {
        validate_low_leaf_jumps_over_slot(low_leaf_preimage, leaf_slot);

        if (value != 0) {
            throw std::runtime_error("Value is nonzero for a non existing slot");
        }
    }

    events.emit(PublicDataTreeReadWriteEvent{
        .contract_address = contract_address,
        .slot = slot,
        .value = value,
        .leaf_slot = leaf_slot,
        .prev_snapshot = snapshot,
        .low_leaf_preimage = low_leaf_preimage,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
    });
}

/**
 * @brief Write a value to the public data tree.
 *
 * Updates the low leaf (value if slot exists, pointers if it doesn't)
 * If the slot doesn't exist, also inserts a new leaf into the tree.
 *
 * @param slot The storage slot being written.
 * @param contract_address The contract address to silo the slot with.
 * @param value The value to write.
 * @param low_leaf_preimage The preimage of the low leaf in the indexed tree.
 * @param low_leaf_index The index of the low leaf in the tree.
 * @param low_leaf_sibling_path The Merkle sibling path for the low leaf.
 * @param prev_snapshot The tree snapshot before the write.
 * @param insertion_sibling_path The Merkle sibling path for inserting a new leaf (used only if slot is new).
 * @param is_protocol_write Whether this is a protocol-level write (e.g., fee payment).
 * @return The new tree snapshot after the write.
 * @throws std::runtime_error If low leaf / merkle validation fails
 */
AppendOnlyTreeSnapshot PublicDataTreeCheck::write(const FF& slot,
                                                  const AztecAddress& contract_address,
                                                  const FF& value,
                                                  const PublicDataTreeLeafPreimage& low_leaf_preimage,
                                                  uint64_t low_leaf_index,
                                                  std::span<const FF> low_leaf_sibling_path,
                                                  const AppendOnlyTreeSnapshot& prev_snapshot,
                                                  std::span<const FF> insertion_sibling_path,
                                                  bool is_protocol_write)
{
    FF leaf_slot = compute_leaf_slot(contract_address, slot);
    // Validate low leaf
    bool exists = low_leaf_preimage.leaf.slot == leaf_slot;
    if (!exists) {
        validate_low_leaf_jumps_over_slot(low_leaf_preimage, leaf_slot);
    }

    // Low leaf update
    FF low_leaf_hash = poseidon2.hash(low_leaf_preimage.get_hash_inputs());

    PublicDataTreeLeafPreimage updated_low_leaf_preimage = low_leaf_preimage;
    if (exists) {
        // Update value
        updated_low_leaf_preimage.leaf.value = value;
    } else {
        // Update pointers
        updated_low_leaf_preimage.nextIndex = prev_snapshot.next_available_leaf_index;
        updated_low_leaf_preimage.nextKey = leaf_slot;
    }

    FF updated_low_leaf_hash = poseidon2.hash(updated_low_leaf_preimage.get_hash_inputs());

    FF intermediate_root = merkle_check.write(DOM_SEP__PUBLIC_DATA_MERKLE,
                                              low_leaf_hash,
                                              updated_low_leaf_hash,
                                              low_leaf_index,
                                              low_leaf_sibling_path,
                                              prev_snapshot.root);

    AppendOnlyTreeSnapshot next_snapshot = AppendOnlyTreeSnapshot{
        .root = intermediate_root,
        .next_available_leaf_index = prev_snapshot.next_available_leaf_index,
    };
    FF new_leaf_hash = 0;
    PublicDataTreeLeafPreimage new_leaf = PublicDataTreeLeafPreimage::empty();
    if (!exists) {
        // Insert new leaf
        new_leaf = PublicDataTreeLeafPreimage(
            PublicDataLeafValue(leaf_slot, value), low_leaf_preimage.nextIndex, low_leaf_preimage.nextKey);

        new_leaf_hash = poseidon2.hash(new_leaf.get_hash_inputs());
        next_snapshot.root = merkle_check.write(DOM_SEP__PUBLIC_DATA_MERKLE,
                                                FF(0),
                                                new_leaf_hash,
                                                prev_snapshot.next_available_leaf_index,
                                                insertion_sibling_path,
                                                intermediate_root);
        next_snapshot.next_available_leaf_index++;
    }

    // The protocol writes happen outside execution, at the end of the tx simulation.
    uint32_t execution_id =
        is_protocol_write ? std::numeric_limits<uint32_t>::max() : execution_id_manager.get_execution_id();

    events.emit(PublicDataTreeReadWriteEvent{
        .contract_address = contract_address,
        .slot = slot,
        .value = value,
        .leaf_slot = leaf_slot,
        .prev_snapshot = prev_snapshot,
        .low_leaf_preimage = low_leaf_preimage,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
        .write_data = PublicDataWriteData{ .updated_low_leaf_preimage = updated_low_leaf_preimage,
                                           .updated_low_leaf_hash = updated_low_leaf_hash,
                                           .new_leaf_hash = new_leaf_hash,
                                           .intermediate_root = intermediate_root,
                                           .next_snapshot = next_snapshot },
        .execution_id = execution_id,
    });

    return next_snapshot;
}

/**
 * @brief Emit a checkpoint-created event for discard reconstruction.
 */
void PublicDataTreeCheck::on_checkpoint_created()
{
    events.emit(CheckPointEventType::CREATE_CHECKPOINT);
}

/**
 * @brief Emit a checkpoint-committed event for discard reconstruction.
 */
void PublicDataTreeCheck::on_checkpoint_committed()
{
    events.emit(CheckPointEventType::COMMIT_CHECKPOINT);
}

/**
 * @brief Emit a checkpoint-reverted event for discard reconstruction.
 */
void PublicDataTreeCheck::on_checkpoint_reverted()
{
    events.emit(CheckPointEventType::REVERT_CHECKPOINT);
}

/**
 * @brief Generates ff_gt events for squashing.
 *
 * @param written_leaf_slots The leaf slots that were written in the tx (unique and nondiscarded).
 */
void PublicDataTreeCheck::generate_ff_gt_events_for_squashing(const std::vector<FF>& written_leaf_slots)
{
    // We need the sorted leaf slots to generate the ff_gt events in order.
    std::vector<FF> sorted_written_leaf_slots = written_leaf_slots;
    // Leaf slot needs to be casted as uint256_t to compare.
    // Sorting over pointers instead of structs would be faster but probably negligible for such a small vector.
    std::ranges::sort(sorted_written_leaf_slots,
                      [](const FF& a, const FF& b) { return static_cast<uint256_t>(a) < static_cast<uint256_t>(b); });

    if (sorted_written_leaf_slots.size() > 1) {
        for (size_t i = 0; i < sorted_written_leaf_slots.size() - 1; i++) {
            field_gt.ff_gt(sorted_written_leaf_slots.at(i + 1), sorted_written_leaf_slots.at(i));
        }
    }
}

} // namespace bb::avm2::simulation
