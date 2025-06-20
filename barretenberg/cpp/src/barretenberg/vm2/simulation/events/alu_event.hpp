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
    // To be used with deduplicating event emitters.
    using Key = std::tuple<AluOperation, MemoryValue, MemoryValue>;
    Key get_key() const { return { operation, a, b }; }
};

} // namespace bb::avm2::simulation
