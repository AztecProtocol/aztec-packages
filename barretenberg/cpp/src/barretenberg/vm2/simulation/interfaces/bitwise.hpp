#pragma once

#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

class BitwiseInterface {
  public:
    virtual ~BitwiseInterface() = default;
    virtual MemoryValue and_op(const MemoryValue& a, const MemoryValue& b) = 0;
    virtual MemoryValue or_op(const MemoryValue& a, const MemoryValue& b) = 0;
    virtual MemoryValue xor_op(const MemoryValue& a, const MemoryValue& b) = 0;
};

} // namespace bb::avm2::simulation
