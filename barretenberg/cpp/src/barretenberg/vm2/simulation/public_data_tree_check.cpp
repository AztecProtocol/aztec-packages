#include "barretenberg/vm2/simulation/public_data_tree_check.hpp"

#include "barretenberg/vm2/simulation/lib/db_interfaces.hpp"

namespace bb::avm2::simulation {

FF PublicDataTreeCheck::compute_leaf_slot(const AztecAddress& contract_address, const FF& slot)
{
    return poseidon2.hash({ GENERATOR_INDEX__PUBLIC_LEAF_INDEX, contract_address, slot });
}

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
    merkle_check.assert_membership(low_leaf_hash, low_leaf_index, sibling_path, snapshot.root);

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
        .execution_id = execution_id_manager.get_execution_id(),
    });
}

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
        updated_low_leaf_preimage.nextIndex = prev_snapshot.nextAvailableLeafIndex;
        updated_low_leaf_preimage.nextKey = leaf_slot;
    }

    FF updated_low_leaf_hash = poseidon2.hash(updated_low_leaf_preimage.get_hash_inputs());

    FF intermediate_root = merkle_check.write(
        low_leaf_hash, updated_low_leaf_hash, low_leaf_index, low_leaf_sibling_path, prev_snapshot.root);

    AppendOnlyTreeSnapshot next_snapshot = AppendOnlyTreeSnapshot{
        .root = intermediate_root,
        .nextAvailableLeafIndex = prev_snapshot.nextAvailableLeafIndex,
    };
    FF new_leaf_hash = 0;
    PublicDataTreeLeafPreimage new_leaf = PublicDataTreeLeafPreimage::empty();
    if (!exists) {
        // Insert new leaf
        new_leaf = PublicDataTreeLeafPreimage(
            PublicDataLeafValue(leaf_slot, value), low_leaf_preimage.nextIndex, low_leaf_preimage.nextKey);

        new_leaf_hash = poseidon2.hash(new_leaf.get_hash_inputs());
        next_snapshot.root = merkle_check.write(
            FF(0), new_leaf_hash, prev_snapshot.nextAvailableLeafIndex, insertion_sibling_path, intermediate_root);
        next_snapshot.nextAvailableLeafIndex++;
    }

    uint32_t execution_id =
        is_protocol_write ? std::numeric_limits<uint32_t>::max() : execution_id_manager.get_execution_id();

    if (last_write_execution_id.has_value()) {
        range_check.assert_range(execution_id - last_write_execution_id.value(), 32);
        last_write_execution_id = execution_id;
    }

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

void PublicDataTreeCheck::on_checkpoint_created()
{
    events.emit(CheckPointEventType::CREATE_CHECKPOINT);
}

void PublicDataTreeCheck::on_checkpoint_committed()
{
    events.emit(CheckPointEventType::COMMIT_CHECKPOINT);
}

void PublicDataTreeCheck::on_checkpoint_reverted()
{
    events.emit(CheckPointEventType::REVERT_CHECKPOINT);
}

} // namespace bb::avm2::simulation
