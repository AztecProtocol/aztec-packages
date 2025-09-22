#pragma once

#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

// Forward declaration
class MemoryInterface;

class KeccakF1600Interface {
  public:
    virtual ~KeccakF1600Interface() = default;
    virtual void permutation(MemoryInterface& memory, MemoryAddress dst_addr, MemoryAddress src_addr) = 0;
};

} // namespace bb::avm2::simulation
