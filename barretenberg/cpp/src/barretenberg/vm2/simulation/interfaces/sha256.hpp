#pragma once

#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

// Forward declarations
class MemoryInterface;

class Sha256Interface {
  public:
    virtual ~Sha256Interface() = default;
    virtual void compression(MemoryInterface&,
                             MemoryAddress state_addr,
                             MemoryAddress input_addr,
                             MemoryAddress output_addr) = 0;
};

} // namespace bb::avm2::simulation
