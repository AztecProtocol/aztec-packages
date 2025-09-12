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
    uint32_t execution_clk;
    AztecAddress contract_address;
    MemoryAddress dst_offset;
    uint8_t member_enum;
    uint32_t space_id;
    FF nullifier_tree_root;
    FF public_data_tree_root;

    // Instance retrieval results including all three members which are all needed for tracegen
    // despite only needing the selected member in simulation.
    bool instance_exists;
    FF retrieved_deployer_addr;
    FF retrieved_class_id;
    FF retrieved_init_hash;
};

} // namespace bb::avm2::simulation
