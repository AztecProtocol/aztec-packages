#include "barretenberg/vm2/simulation/written_public_data_slots_tree_check.hpp"

#include "barretenberg/vm2/simulation/lib/db_interfaces.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"

namespace bb::avm2::simulation {

FF WrittenPublicDataSlotsTreeCheck::compute_leaf_slot(const AztecAddress& contract_address, const FF& slot)
{
    return poseidon2.hash({ GENERATOR_INDEX__PUBLIC_LEAF_INDEX, contract_address, slot });
}

void WrittenPublicDataSlotsTreeCheck::validate_low_leaf_jumps_over_slot(
    const WrittenPublicDataSlotsTreeLeafPreimage& low_leaf_preimage, const FF& leaf_slot)
{
    if (!field_gt.ff_gt(leaf_slot, low_leaf_preimage.leaf.slot)) {
        throw std::runtime_error("Low leaf slot is GTE leaf slot");
    }
    if (low_leaf_preimage.nextKey != 0 && !field_gt.ff_gt(low_leaf_preimage.nextKey, leaf_slot)) {
        throw std::runtime_error("Leaf slot is GTE low leaf next slot");
    }
}

bool WrittenPublicDataSlotsTreeCheck::contains(const AztecAddress& contract_address, const FF& slot)
{
    FF leaf_slot = compute_leaf_slot(contract_address, slot);

    const auto& tree = written_public_data_slots_tree_stack.top();
    const auto snapshot = tree.get_snapshot();
    auto [exists, low_leaf_index] = tree.get_low_indexed_leaf(leaf_slot);
    auto sibling_path = tree.get_sibling_path(low_leaf_index);
    auto low_leaf_preimage = tree.get_leaf_preimage(low_leaf_index);

    // Low leaf membership
    FF low_leaf_hash = poseidon2.hash(low_leaf_preimage.get_hash_inputs());
    merkle_check.assert_membership(low_leaf_hash, low_leaf_index, sibling_path, snapshot.root);

    if (exists) {
        if (low_leaf_preimage.leaf.slot != leaf_slot) {
            throw std::runtime_error("Slot membership check failed");
        }
    } else {
        validate_low_leaf_jumps_over_slot(low_leaf_preimage, leaf_slot);
    }

    events.emit(WrittenPublicDataSlotsTreeCheckEvent{
        .contract_address = contract_address,
        .slot = slot,
        .leaf_slot = leaf_slot,
        .prev_snapshot = snapshot,
        .next_snapshot = snapshot,
        .low_leaf_preimage = low_leaf_preimage,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
    });

    return exists;
}

void WrittenPublicDataSlotsTreeCheck::insert(const AztecAddress& contract_address, const FF& slot)
{
    FF leaf_slot = compute_leaf_slot(contract_address, slot);

    auto& tree = written_public_data_slots_tree_stack.top();
    AppendOnlyTreeSnapshot prev_snapshot = tree.get_snapshot();
    auto insertion_result = tree.insert_indexed_leaves({ { WrittenPublicDataSlotLeafValue(leaf_slot) } });
    auto& [low_leaf_preimage, low_leaf_index, low_leaf_sibling_path] = insertion_result.low_leaf_witness_data.at(0);
    std::span<FF> insertion_sibling_path = insertion_result.insertion_witness_data.at(0).path;

    bool exists = leaf_slot == low_leaf_preimage.leaf.slot;

    AppendOnlyTreeSnapshot next_snapshot = prev_snapshot;
    std::optional<SlotAppendData> append_data = std::nullopt;

    FF low_leaf_hash = poseidon2.hash(low_leaf_preimage.get_hash_inputs());
    if (exists) {
        merkle_check.assert_membership(low_leaf_hash, low_leaf_index, low_leaf_sibling_path, prev_snapshot.root);
    } else {
        validate_low_leaf_jumps_over_slot(low_leaf_preimage, leaf_slot);
        // Low leaf update
        WrittenPublicDataSlotsTreeLeafPreimage updated_low_leaf_preimage = low_leaf_preimage;
        updated_low_leaf_preimage.nextIndex = prev_snapshot.nextAvailableLeafIndex;
        updated_low_leaf_preimage.nextKey = leaf_slot;

        FF updated_low_leaf_hash = poseidon2.hash(updated_low_leaf_preimage.get_hash_inputs());

        FF intermediate_root = merkle_check.write(
            low_leaf_hash, updated_low_leaf_hash, low_leaf_index, low_leaf_sibling_path, prev_snapshot.root);

        WrittenPublicDataSlotsTreeLeafPreimage new_leaf_preimage = WrittenPublicDataSlotsTreeLeafPreimage(
            WrittenPublicDataSlotLeafValue(leaf_slot), low_leaf_preimage.nextIndex, low_leaf_preimage.nextKey);

        FF new_leaf_hash = poseidon2.hash(new_leaf_preimage.get_hash_inputs());

        FF write_root = merkle_check.write(
            FF(0), new_leaf_hash, prev_snapshot.nextAvailableLeafIndex, insertion_sibling_path, intermediate_root);

        next_snapshot = AppendOnlyTreeSnapshot{
            .root = write_root,
            .nextAvailableLeafIndex = prev_snapshot.nextAvailableLeafIndex + 1,
        };
        assert(next_snapshot == tree.get_snapshot());
        append_data = SlotAppendData{
            .updated_low_leaf_hash = updated_low_leaf_hash,
            .new_leaf_hash = new_leaf_hash,
            .intermediate_root = intermediate_root,
        };
    }

    events.emit(WrittenPublicDataSlotsTreeCheckEvent{
        .contract_address = contract_address,
        .slot = slot,
        .leaf_slot = leaf_slot,
        .prev_snapshot = prev_snapshot,
        .next_snapshot = next_snapshot,
        .low_leaf_preimage = low_leaf_preimage,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
        .write = true,
        .append_data = append_data,
    });
}

AppendOnlyTreeSnapshot WrittenPublicDataSlotsTreeCheck::snapshot() const
{
    return written_public_data_slots_tree_stack.top().get_snapshot();
}

uint32_t WrittenPublicDataSlotsTreeCheck::size() const
{
    // -1 Since the tree has a prefill leaf at index 0.
    return static_cast<uint32_t>(written_public_data_slots_tree_stack.top().get_snapshot().nextAvailableLeafIndex) - 1;
}

void WrittenPublicDataSlotsTreeCheck::create_checkpoint()
{
    written_public_data_slots_tree_stack.push(written_public_data_slots_tree_stack.top());
}

void WrittenPublicDataSlotsTreeCheck::commit_checkpoint()
{
    WrittenPublicDataSlotsTree current_tree = std::move(written_public_data_slots_tree_stack.top());
    written_public_data_slots_tree_stack.pop();
    written_public_data_slots_tree_stack.top() = std::move(current_tree);
}

void WrittenPublicDataSlotsTreeCheck::revert_checkpoint()
{
    written_public_data_slots_tree_stack.pop();
}

} // namespace bb::avm2::simulation
