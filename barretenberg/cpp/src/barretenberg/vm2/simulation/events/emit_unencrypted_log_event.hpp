#pragma once

#include <cstdint>
#include <stdexcept>
#include <string>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

struct EmitUnencryptedLogException : public std::runtime_error {
    explicit EmitUnencryptedLogException(const std::string& message)
        : std::runtime_error("Error in EmitUnencryptedLog: " + message)
    {}
};

struct EmitUnencryptedLogEvent {
    uint32_t execution_clk;
    AztecAddress contract_address;
    uint32_t space_id;
    MemoryAddress log_offset;
    uint32_t log_size;
    uint32_t prev_num_logs_emitted;
    uint32_t next_num_logs_emitted;
    bool is_static;
    std::vector<MemoryValue> values;

    bool error_too_large;
    bool error_memory_out_of_bounds;
    bool error_too_many_logs;
    bool error_is_static;
    bool error_tag_mismatch;

    bool operator==(const EmitUnencryptedLogEvent& other) const = default;
};

} // namespace bb::avm2::simulation
