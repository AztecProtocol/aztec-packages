#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

enum class BitwiseTagError {
    TAG_MISMATCH,
    INVALID_FF_TAG,
};
inline std::string to_string(BitwiseTagError e)
{
    switch (e) {
    case BitwiseTagError::TAG_MISMATCH:
        return "TAG_MISMATCH";
    case BitwiseTagError::INVALID_FF_TAG:
        return "INVALID_FF_TAG";
    }
    // We should be catching all the cases above.
    __builtin_unreachable();
}

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
