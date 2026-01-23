#include "barretenberg/vm2/simulation/gadgets/l1_to_l2_message_tree_check.hpp"

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/events/l1_to_l2_message_tree_check_event.hpp"

namespace bb::avm2::simulation {

bool L1ToL2MessageTreeCheck::exists(const FF& msg_hash,
                                    const FF& leaf_value,
                                    uint64_t leaf_index,
                                    std::span<const FF> sibling_path,
                                    const AppendOnlyTreeSnapshot& snapshot)
{
    merkle_check.assert_membership(leaf_value, leaf_index, sibling_path, snapshot.root);
    events.emit(L1ToL2MessageTreeCheckEvent{
        .msg_hash = msg_hash, .leaf_value = leaf_value, .leaf_index = leaf_index, .snapshot = snapshot });
    return msg_hash == leaf_value;
}

} // namespace bb::avm2::simulation
