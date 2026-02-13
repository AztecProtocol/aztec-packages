#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

// Forward declarations
class ContextInterface;
class MemoryInterface;

class EmitPublicLogInterface {
  public:
    virtual ~EmitPublicLogInterface() = default;
    virtual void emit_public_log(MemoryInterface& memory,
                                 ContextInterface& context,
                                 const AztecAddress& contract_address,
                                 MemoryAddress log_offset,
                                 uint32_t log_size) = 0;
};

} // namespace bb::avm2::simulation
