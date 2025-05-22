#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::simulation {

struct ContextEvent {
    uint32_t id;
    uint32_t parent_id;

    // State
    uint32_t pc;
    uint32_t next_pc;
    AztecAddress msg_sender;
    AztecAddress contract_addr;
    bool is_static;

    // Calldata info from parent context
    uint32_t parent_cd_addr;
    uint32_t parent_cd_size_addr;

    // Returndata info from child context
    uint32_t last_child_rd_addr;
    uint32_t last_child_rd_size_addr;
    // Success
    bool last_child_success;

    // Gas
    // uint32_t l2_gas_used;
    // uint32_t l2_gas_limit;
    // uint32_t da_gas_used;
    // uint32_t da_gas_limit;

    // Tree State
    // TreeSnapshots tree_state;
};

struct ContextStackEvent {
    uint32_t id;
    uint32_t parent_id;
    uint32_t entered_context_id;

    // State
    uint32_t next_pc;
    AztecAddress msg_sender;
    AztecAddress contract_addr;
    bool is_static;

    // Calldata info from parent context
    uint32_t parent_cd_addr;
    uint32_t parent_cd_size_addr;

    // Gas
    // uint32_t l2_gas_used;
    // uint32_t l2_gas_limit;
    // uint32_t da_gas_used;
    // uint32_t da_gas_limit;

    // Tree State
    // TreeSnapshots tree_state;
};

} // namespace bb::avm2::simulation
