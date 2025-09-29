#pragma once

#include <vector>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

namespace bb::avm2::simulation {

// Forward declarations
class MemoryInterface;

class AddressingInterface {
  public:
    virtual ~AddressingInterface() = default;
    // @throws AddressingException.
    virtual std::vector<Operand> resolve(const Instruction& instruction, MemoryInterface& memory) = 0;
};

} // namespace bb::avm2::simulation
