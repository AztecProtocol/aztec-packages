#include "barretenberg/vm2/tracegen/l1_to_l2_message_tree_trace.hpp"

#include <cstdint>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/lookups_l1_to_l2_message_tree_check.hpp"

namespace bb::avm2::tracegen {

/**
 * @brief Process the L1-to-L2 message tree check events and populate the relevant columns in the trace.
 *
 * Each event produces one trace row.
 *
 * @param events The container of L1-to-L2 message tree check events to process.
 * @param trace The trace container.
 */
void L1ToL2MessageTreeCheckTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::L1ToL2MessageTreeCheckEvent>::Container& events,
    TraceContainer& trace)
{
    using C = Column;

    uint32_t row = 0;
    for (const auto& event : events) {
        bool exists = event.leaf_value == event.msg_hash;
        FF leaf_value_msg_hash_diff = event.leaf_value - event.msg_hash;

        trace.set(row,
                  { { { C::l1_to_l2_message_tree_check_sel, 1 },
                      { C::l1_to_l2_message_tree_check_exists, exists },
                      { C::l1_to_l2_message_tree_check_msg_hash, event.msg_hash },
                      { C::l1_to_l2_message_tree_check_leaf_index, event.leaf_index },
                      { C::l1_to_l2_message_tree_check_root, event.snapshot.root },
                      { C::l1_to_l2_message_tree_check_leaf_value, event.leaf_value },
                      { C::l1_to_l2_message_tree_check_leaf_value_msg_hash_diff_inv,
                        leaf_value_msg_hash_diff }, // Will be inverted in batch later
                      { C::l1_to_l2_message_tree_check_l1_to_l2_message_tree_height, L1_TO_L2_MSG_TREE_HEIGHT },
                      { C::l1_to_l2_message_tree_check_merkle_hash_separator, DOM_SEP__MERKLE_HASH } } });
        row++;
    }

    // Batch invert the columns.
    trace.invert_columns({ { C::l1_to_l2_message_tree_check_leaf_value_msg_hash_diff_inv } });
}

const InteractionDefinition L1ToL2MessageTreeCheckTraceBuilder::interactions =
    InteractionDefinition()
        .add<InteractionType::LookupSequential, lookup_l1_to_l2_message_tree_check_merkle_check_settings>();

} // namespace bb::avm2::tracegen
