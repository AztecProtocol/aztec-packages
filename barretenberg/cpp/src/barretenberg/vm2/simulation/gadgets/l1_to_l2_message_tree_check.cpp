#include "barretenberg/vm2/simulation/gadgets/l1_to_l2_message_tree_check.hpp"

#include "barretenberg/aztec/aztec_constants.hpp"

namespace bb::avm2::simulation {

/**
 * @brief Checks whether an L1-to-L2 message exists in the message tree via Merkle membership proof.
 *
 * Verifies that @p leaf_value is present at @p leaf_index in the tree whose root is given by
 * @p snapshot, then compares it against the user provided @p msg_hash.
 * @note This won't check that leaf index is less than the next available leaf index.
 *
 * @param msg_hash The message hash the user wants to know if exists.
 * @param leaf_value The actual leaf value retrieved from the tree.
 * @param leaf_index The index of the leaf in the tree.
 * @param sibling_path The Merkle sibling path used for the membership proof.
 * @param snapshot The tree snapshot to verify against.
 * @return true if @p msg_hash equals @p leaf_value, false otherwise.
 */
bool L1ToL2MessageTreeCheck::exists(const FF& msg_hash,
                                    const FF& leaf_value,
                                    uint64_t leaf_index,
                                    std::span<const FF> sibling_path,
                                    const AppendOnlyTreeSnapshot& snapshot)
{
    merkle_check.assert_membership(DOM_SEP__MERKLE_HASH, leaf_value, leaf_index, sibling_path, snapshot.root);
    events.emit(L1ToL2MessageTreeCheckEvent{
        .msg_hash = msg_hash, .leaf_value = leaf_value, .leaf_index = leaf_index, .snapshot = snapshot });
    return msg_hash == leaf_value;
}

} // namespace bb::avm2::simulation
