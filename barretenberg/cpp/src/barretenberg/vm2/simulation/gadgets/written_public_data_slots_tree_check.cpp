#include "barretenberg/vm2/simulation/gadgets/written_public_data_slots_tree_check.hpp"

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"

namespace bb::avm2::simulation {

/**
 * @brief Checks whether a public data slot exists in the written public data slots tree.
 *
 * Computes the leaf slot from the contract address and slot, queries the in memory tree for the
 * low leaf, converts it to generic IndexedTreeLeafData, and delegates the membership/non-membership
 * proof to the indexed tree check gadget. Siloing is applied using the public leaf slot domain separator.
 *
 * @param contract_address The address of the contract that owns the slot.
 * @param slot The public data slot to look up.
 * @return True if the slot exists in the tree, false otherwise.
 */
bool WrittenPublicDataSlotsTreeCheck::contains(const AztecAddress& contract_address, const FF& slot)
{
    FF leaf_slot = unconstrained_compute_leaf_slot(contract_address, slot);

    const auto& tree = written_public_data_slots_tree_stack.top();
    const auto snapshot = tree.get_snapshot();
    auto [exists, low_leaf_index] = tree.get_low_indexed_leaf(leaf_slot);
    auto sibling_path = tree.get_sibling_path(low_leaf_index);
    auto low_leaf_preimage = tree.get_leaf_preimage(low_leaf_index);

    indexed_tree_check.assert_read(slot,
                                   IndexedTreeSiloingParameters{
                                       .address = contract_address,
                                       .siloing_separator = DOM_SEP__PUBLIC_LEAF_SLOT,
                                   },
                                   exists,
                                   IndexedTreeLeafData{
                                       .value = low_leaf_preimage.leaf.slot,
                                       .next_value = low_leaf_preimage.nextKey,
                                       .next_index = low_leaf_preimage.nextIndex,
                                   },
                                   low_leaf_index,
                                   sibling_path,
                                   snapshot);
    return exists;
}

/**
 * @brief Inserts a public data slot into the written public data slots tree.
 *
 * Computes the leaf slot, performs the insertion on the in memory tree, then delegates the constrained
 * write (or duplicate detection) to the indexed tree check gadget. Siloing is applied using the
 * public leaf slot domain separator.
 *
 * @param contract_address The address of the contract that owns the slot.
 * @param slot The public data slot to insert.
 * @throws std::runtime_error If the indexed tree check write returns a snapshot that does not match the in memory tree.
 */
void WrittenPublicDataSlotsTreeCheck::insert(const AztecAddress& contract_address, const FF& slot)
{
    FF leaf_slot = unconstrained_compute_leaf_slot(contract_address, slot);

    auto& tree = written_public_data_slots_tree_stack.top();
    AppendOnlyTreeSnapshot prev_snapshot = tree.get_snapshot();
    auto insertion_result = tree.insert_indexed_leaves({ { WrittenPublicDataSlotLeafValue(leaf_slot) } });
    auto& [low_leaf_preimage, low_leaf_index, low_leaf_sibling_path] = insertion_result.low_leaf_witness_data.at(0);
    std::span<FF> insertion_sibling_path = insertion_result.insertion_witness_data.at(0).path;

    // If we pass a insertion sibling path, indexed tree check will assert that the leaf doesn't exist,
    // otherwise, it will assert that the leaf exists.
    bool exists = leaf_slot == low_leaf_preimage.leaf.slot;

    AppendOnlyTreeSnapshot next_snapshot =
        indexed_tree_check.write(slot,
                                 IndexedTreeSiloingParameters{
                                     .address = contract_address,
                                     .siloing_separator = DOM_SEP__PUBLIC_LEAF_SLOT,
                                 },
                                 std::nullopt, // No public inputs write
                                 IndexedTreeLeafData{
                                     .value = low_leaf_preimage.leaf.slot,
                                     .next_value = low_leaf_preimage.nextKey,
                                     .next_index = low_leaf_preimage.nextIndex,
                                 },
                                 low_leaf_index,
                                 low_leaf_sibling_path,
                                 prev_snapshot,
                                 exists ? std::nullopt : std::optional(insertion_sibling_path));

    // This will throw an unexpected exception if it fails.
    BB_ASSERT_EQ(next_snapshot, tree.get_snapshot(), "Next snapshot mismatch");
}

/**
 * @brief Returns the current tree snapshot from the top of the checkpoint stack.
 * @return The current tree snapshot.
 */
AppendOnlyTreeSnapshot WrittenPublicDataSlotsTreeCheck::get_snapshot() const
{
    return written_public_data_slots_tree_stack.top().get_snapshot();
}

/**
 * @brief Returns the number of written public data slots in the tree.
 * @return The number of slots, excluding the prefill leaf at index 0.
 * @note Subtracts 1 to account for the prefill leaf at index 0.
 */
uint32_t WrittenPublicDataSlotsTreeCheck::size() const
{
    // -1 Since the tree has a prefill leaf at index 0.
    return static_cast<uint32_t>(written_public_data_slots_tree_stack.top().get_snapshot().next_available_leaf_index) -
           1;
}

/**
 * @brief Creates a checkpoint by pushing a copy of the current tree state onto the stack.
 *
 * Subsequent writes modify only the top of the stack, allowing the checkpoint to be
 * reverted (discarding changes) or committed (propagating changes down).
 */
void WrittenPublicDataSlotsTreeCheck::create_checkpoint()
{
    WrittenPublicDataSlotsTree current_tree = written_public_data_slots_tree_stack.top();
    written_public_data_slots_tree_stack.push(current_tree);
}

/**
 * @brief Commits the current checkpoint by replacing the previous tree state with the current one.
 *
 * Pops the top of the stack and overwrites the new top, finalizing all writes made since
 * the last create_checkpoint call.
 */
void WrittenPublicDataSlotsTreeCheck::commit_checkpoint()
{
    // Commit the current top of the stack down one level.
    WrittenPublicDataSlotsTree current_tree = std::move(written_public_data_slots_tree_stack.top());
    written_public_data_slots_tree_stack.pop();
    written_public_data_slots_tree_stack.top() = std::move(current_tree);
}

/**
 * @brief Reverts the current checkpoint by discarding the top of the tree state stack.
 *
 * All writes made since the last create_checkpoint call are discarded, restoring the
 * tree to its previous state.
 */
void WrittenPublicDataSlotsTreeCheck::revert_checkpoint()
{
    written_public_data_slots_tree_stack.pop();
}

} // namespace bb::avm2::simulation
