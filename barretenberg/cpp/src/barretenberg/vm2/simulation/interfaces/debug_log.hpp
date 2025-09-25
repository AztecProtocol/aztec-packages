#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/interfaces/memory.hpp"

namespace bb::avm2::simulation {

class DebugLoggerInterface {
  public:
    virtual ~DebugLoggerInterface() = default;

    virtual void debug_log(MemoryInterface& memory,
                           AztecAddress contract_address,
                           MemoryAddress level_offset,
                           MemoryAddress message_offset,
                           uint16_t message_size,
                           MemoryAddress fields_offset,
                           MemoryAddress fields_size_offset) = 0;
};

} // namespace bb::avm2::simulation
