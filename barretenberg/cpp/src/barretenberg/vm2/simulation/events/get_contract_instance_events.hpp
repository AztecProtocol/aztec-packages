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
    uint32_t timestamp;
    AztecAddress contract_address;
    MemoryAddress dst_offset;
    uint8_t member_enum;
    uint32_t space_id;

    // Bounds checking for dst_offset+1
    bool dst_out_of_bounds;

    // Member validation
    bool member_enum_error;

    // Instance retrieval results including all three members (needed for PIL tracegen)
    bool instance_exists;
    FF retrieved_deployer_addr;
    FF retrieved_class_id;
    FF retrieved_init_hash;
    FF selected_member; // one of the above three, selected by enum (for simpler tracegen)
};

} // namespace bb::avm2::simulation
