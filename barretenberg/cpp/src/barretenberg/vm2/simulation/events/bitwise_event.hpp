#pragma once

#include <cstdint>
#include <vector>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"

namespace bb::avm2::simulation {

enum class BitwiseOperation {
    AND,
    OR,
    XOR,
};

struct BitwiseEvent {
    BitwiseOperation operation;
    MemoryValue a;
    MemoryValue b;
    MemoryTag tag;
    MemoryValue res;
};

} // namespace bb::avm2::simulation