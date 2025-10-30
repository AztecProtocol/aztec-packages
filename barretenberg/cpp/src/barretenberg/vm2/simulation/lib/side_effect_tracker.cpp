#include "barretenberg/vm2/simulation/lib/side_effect_tracker.hpp"

#include <numeric>

namespace bb::avm2::simulation {

uint32_t TrackedSideEffects::get_num_unencrypted_log_fields() const
{
    return public_logs.length;
}

void SideEffectTracker::add_nullifier(const FF& siloed_nullifier)
{
    tracked_tree_side_effects.top().nullifiers.push_back(siloed_nullifier);
}

void SideEffectTracker::add_note_hash(const FF& siloed_unique_note_hash)
{
    tracked_tree_side_effects.top().note_hashes.push_back(siloed_unique_note_hash);
}

void SideEffectTracker::add_l2_to_l1_message(const AztecAddress& contract_address,
                                             const EthAddress& recipient,
                                             const FF& content)
{
    tracked_tree_side_effects.top().l2_to_l1_messages.push_back(ScopedL2ToL1Message{
        .message = { .recipient = recipient, .content = content }, .contractAddress = contract_address });
}

void SideEffectTracker::add_public_log(const AztecAddress& contract_address, const std::vector<FF>& fields)
{
    tracked_tree_side_effects.top().public_logs.add_log(
        PublicLog{ .fields = fields, .contractAddress = contract_address });
}

void SideEffectTracker::add_storage_write(const FF& slot, const FF& value)
{
    auto& top = tracked_tree_side_effects.top();

    // Track the slots in the order that they were written.
    if (!top.storage_writes_slot_to_value.contains(slot)) {
        top.storage_writes_slots_by_insertion.push_back(slot);
    }
    top.storage_writes_slot_to_value[slot] = value;
}

void SideEffectTracker::create_checkpoint()
{
    TrackedSideEffects top = tracked_tree_side_effects.top();
    tracked_tree_side_effects.push(std::move(top));
}

void SideEffectTracker::commit_checkpoint()
{
    // This creates a deep copy of the top of the stack.
    TrackedSideEffects top = tracked_tree_side_effects.top();
    tracked_tree_side_effects.pop();
    tracked_tree_side_effects.top() = std::move(top);
}

void SideEffectTracker::revert_checkpoint()
{
    tracked_tree_side_effects.pop();
}

} // namespace bb::avm2::simulation
