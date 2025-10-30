#pragma once

#include <cstdint>
#include <stdexcept>
#include <vector>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

struct DataCopyException : public std::runtime_error {
    explicit DataCopyException(const std::string& message)
        : std::runtime_error(message)
    {}
};

enum class DataCopyOperation : uint8_t {
    CD_COPY,
    RD_COPY,
};

struct DataCopyEvent {
    uint32_t execution_clk = 0; // Data copy will read and write memory,
    DataCopyOperation operation = DataCopyOperation::CD_COPY;
    std::vector<MemoryValue> copying_data; // A portion of the padded version of calldata/returndata
    uint32_t write_context_id = 0;         // For mem aware subtraces, they need the context id when referencing memory
    uint32_t read_context_id = 0;          // Refers to the parent/child context id
    // Loaded from X_data_copy opcode
    uint32_t data_copy_size = 0;
    uint32_t data_offset = 0;
    // This is a direct address from the parent/child context for calldata/returndata
    MemoryAddress src_data_addr = 0;
    uint32_t src_data_size = 0; // Size of the calldata/returndata
    bool is_nested = false;
    // Output Address
    MemoryAddress dst_addr = 0;
};

} // namespace bb::avm2::simulation
