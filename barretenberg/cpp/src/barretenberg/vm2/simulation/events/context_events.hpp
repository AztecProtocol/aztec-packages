#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::simulation {

struct ContextEvent {
    uint32_t id = 0;
    uint32_t parent_id = 0;
    uint32_t last_child_id = 0;

    // State
    PC pc = 0;
    AztecAddress msg_sender = 0;
    AztecAddress contract_addr = 0;
    BytecodeId bytecode_id = 0;
    FF transaction_fee = 0;
    bool is_static = false;

    // Calldata info from parent context
    uint32_t parent_cd_addr = 0;
    uint32_t parent_cd_size = 0;

    // Return data info from child context
    uint32_t last_child_rd_addr = 0;
    uint32_t last_child_rd_size = 0;
    bool last_child_success = true;

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

    // Non-tree-tracked side effects
    uint32_t numPublicLogFields = 0;
    uint32_t numL2ToL1Messages = 0;

    // Phase
    TransactionPhase phase = TransactionPhase::NR_NULLIFIER_INSERTION;
};

struct ContextStackEvent {
    uint32_t id = 0;
    uint32_t parent_id = 0;
    uint32_t entered_context_id = 0;

    // State
    PC next_pc = 0;
    AztecAddress msg_sender = 0;
    AztecAddress contract_addr = 0;
    BytecodeId bytecode_id = 0;
    bool is_static = false;

    // Calldata info from parent context
    uint32_t parent_cd_addr = 0;
    uint32_t parent_cd_size = 0;

    // Gas
    Gas parent_gas_used;
    Gas parent_gas_limit;

    // Internal Call Stack Info
    InternalCallId internal_call_id = 0;
    InternalCallId internal_call_return_id = 0;
    InternalCallId next_internal_call_id = 0;

    // Tree States
    TreeStates tree_states;
    AppendOnlyTreeSnapshot written_public_data_slots_tree_snapshot;

    // Non-tree-tracked side effects
    uint32_t numPublicLogFields = 0;
    uint32_t numL2ToL1Messages = 0;
};

} // namespace bb::avm2::simulation
