#pragma once

#include <cstdint>
#include <vector>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"

namespace bb::avm2::simulation {

enum class AluOperation {
    ADD,
};

struct AluEvent {
    AluOperation operation;
    MemoryValue a;
    MemoryValue b;
    MemoryValue c;
    // Only need single tag info here (check this for MOV or CAST )
    // For operations that have a specific output tag (e.g., EQ/LT), the output tag is unambiguous
    // We still might prefer to include tags per operands to simply tracegen...
    MemoryTag tag;
    // To be used with deduplicating event emitters.
    using Key = std::tuple<AluOperation, MemoryValue, MemoryValue, MemoryValue, MemoryTag>;
    Key get_key() const { return { operation, a, b, c, tag }; }
};

} // namespace bb::avm2::simulation
