#pragma once

#include <vector>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

enum class DataCopyOperation {
    CD_COPY = 1,
    RD_COPY = 2,
};

struct DataCopyEvent {
    DataCopyOperation operation;
    std::vector<FF> calldata;
    uint32_t context_id;           // Needed to reference the top level call request if the calldata is at the top level
    uint32_t write_context_id = 0; // For mem aware subtraces, they need the context id when referencing memory
    uint32_t read_context_id = 0;  // Refers to the parent/child context id
    // Loaded from X_data_copy opcode
    uint32_t data_copy_size;
    uint32_t data_offset;
    // This is a direct address from the parent/child context for calldata/returndata
    MemoryAddress data_addr = 0;
    uint32_t data_size = 0;
    bool is_nested = false;
    // Output Address
    MemoryAddress dst_addr = 0;
};

} // namespace bb::avm2::simulation
