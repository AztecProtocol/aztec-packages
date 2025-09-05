#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::simulation {

struct TxContextEvent {
    // Gas
    Gas gas_used;

    // Tree State
    TreeStates tree_states;
    AppendOnlyTreeSnapshot written_public_data_slots_tree_snapshot;
    AppendOnlyTreeSnapshot retrieved_bytecodes_tree_snapshot;

    // Side Effect States
    SideEffectStates side_effect_states;

    // Execution context
    uint32_t next_context_id;
};

} // namespace bb::avm2::simulation
