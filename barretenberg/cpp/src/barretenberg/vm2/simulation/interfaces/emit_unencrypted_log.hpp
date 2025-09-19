#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

// Forward declarations
class ContextInterface;
class MemoryInterface;

class EmitUnencryptedLogInterface {
  public:
    virtual ~EmitUnencryptedLogInterface() = default;
    virtual void emit_unencrypted_log(MemoryInterface& memory,
                                      ContextInterface& context,
                                      AztecAddress contract_address,
                                      MemoryAddress log_offset,
                                      uint32_t log_size) = 0;
};

} // namespace bb::avm2::simulation
