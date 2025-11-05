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

    // To be used with deduplicating event emitters.
    using Key = std::tuple<BitwiseOperation, MemoryValue, MemoryValue>;
    Key get_key() const { return { operation, a, b }; }

    bool operator==(const BitwiseEvent& other) const = default;
};

} // namespace bb::avm2::simulation
