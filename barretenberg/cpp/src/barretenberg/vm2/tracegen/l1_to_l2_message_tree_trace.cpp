#include "barretenberg/vm2/tracegen/l1_to_l2_message_tree_trace.hpp"

#include <cassert>
#include <memory>
#include <stack>
#include <unordered_map>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/generated/relations/lookups_l1_to_l2_message_tree_check.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/tracegen/lib/discard_reconstruction.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"

namespace bb::avm2::tracegen {

void L1ToL2MessageTreeCheckTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::L1ToL2MessageTreeCheckEvent>::Container& events,
    TraceContainer& trace)
{
    using C = Column;

    uint32_t row = 0;
    for (const auto& event : events) {
        bool exists = event.leaf_value == event.msg_hash;
        FF leaf_value_msg_hash_diff_inv = exists ? 0 : (event.leaf_value - event.msg_hash).invert();

        trace.set(row,
                  { { { C::l1_to_l2_message_tree_check_sel, 1 },
                      { C::l1_to_l2_message_tree_check_exists, exists },
                      { C::l1_to_l2_message_tree_check_msg_hash, event.msg_hash },
                      { C::l1_to_l2_message_tree_check_leaf_index, event.leaf_index },
                      { C::l1_to_l2_message_tree_check_root, event.snapshot.root },
                      { C::l1_to_l2_message_tree_check_leaf_value, event.leaf_value },
                      { C::l1_to_l2_message_tree_check_leaf_value_msg_hash_diff_inv, leaf_value_msg_hash_diff_inv },
                      { C::l1_to_l2_message_tree_check_l1_to_l2_message_tree_height, L1_TO_L2_MSG_TREE_HEIGHT } } });
        row++;
    }
}

const InteractionDefinition L1ToL2MessageTreeCheckTraceBuilder::interactions =
    InteractionDefinition()
        .add<lookup_l1_to_l2_message_tree_check_merkle_check_settings, InteractionType::LookupGeneric>();

} // namespace bb::avm2::tracegen
