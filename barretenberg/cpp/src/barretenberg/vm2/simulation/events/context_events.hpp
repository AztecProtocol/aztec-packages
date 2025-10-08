#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/events/bytecode_events.hpp"

namespace bb::avm2::simulation {

struct ContextEvent {
    uint32_t id;
    uint32_t parent_id;
    uint32_t last_child_id;

    // State
    uint32_t pc;
    AztecAddress msg_sender;
    AztecAddress contract_addr;
    BytecodeId bytecode_id;
    FF transaction_fee;
    bool is_static;

    // Calldata info from parent context
    uint32_t parent_cd_addr;
    uint32_t parent_cd_size;

    // Return data info from child context
    uint32_t last_child_rd_addr;
    uint32_t last_child_rd_size;
    bool last_child_success;

    // Gas
    Gas gas_used;
    Gas gas_limit;

    Gas parent_gas_used;
    Gas parent_gas_limit;

    // Internal Call Stack Info
    InternalCallId internal_call_id = 0;
    InternalCallId internal_call_return_id = 0;
    InternalCallId next_internal_call_id = 0;

    // Tree States
    TreeStates tree_states;
    AppendOnlyTreeSnapshot written_public_data_slots_tree_snapshot;
    AppendOnlyTreeSnapshot retrieved_bytecodes_tree_snapshot;

    // Side Effects
    SideEffectStates side_effect_states;

    // Phase
    TransactionPhase phase;
};

struct ContextStackEvent {
    uint32_t id;
    uint32_t parent_id;
    uint32_t entered_context_id;

    // State
    uint32_t next_pc;
    AztecAddress msg_sender;
    AztecAddress contract_addr;
    BytecodeId bytecode_id;
    bool is_static;

    // Calldata info from parent context
    uint32_t parent_cd_addr;
    uint32_t parent_cd_size;

    // Gas
    Gas parent_gas_used;
    Gas parent_gas_limit;

    // Tree States
    TreeStates tree_states;
    AppendOnlyTreeSnapshot written_public_data_slots_tree_snapshot;

    // Side Effect States
    SideEffectStates side_effect_states;
};

} // namespace bb::avm2::simulation
