#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

class BitwiseException : public std::runtime_error {
  public:
    BitwiseException(const std::string& msg)
        : std::runtime_error("Bitwise Exception: " + msg)
    {}
};

struct BitwiseEvent {
    BitwiseOperation operation;
    MemoryValue a;
    MemoryValue b;
    uint128_t res = 0;
};

} // namespace bb::avm2::simulation
