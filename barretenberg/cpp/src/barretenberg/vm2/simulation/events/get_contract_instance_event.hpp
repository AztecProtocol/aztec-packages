#pragma once

#include <cstdint>
#include <stdexcept>
#include <string>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

struct GetContractInstanceException : public std::runtime_error {
    explicit GetContractInstanceException(const std::string& message)
        : std::runtime_error("Error in GetContractInstance: " + message)
    {}
};

struct GetContractInstanceEvent {
    // Interface columns
    uint32_t execution_clk = 0;
    AztecAddress contract_address = 0;
    MemoryAddress dst_offset = 0;
    uint8_t member_enum = 0;
    uint16_t space_id = 0;
    FF nullifier_tree_root = 0;
    FF public_data_tree_root = 0;

    // Instance retrieval results including all four members which are all needed for tracegen
    // despite only needing the selected member in simulation.
    bool instance_exists = false;
    FF retrieved_deployer_addr = 0;
    FF retrieved_class_id = 0;
    FF retrieved_init_hash = 0;
    FF retrieved_immutables_hash = 0;
};

} // namespace bb::avm2::simulation
