#pragma once

#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

#include <cstdint>

namespace bb::avm2::simulation {

struct BitwiseEvent {
    BitwiseOperation operation;
    MemoryValue a;
    MemoryValue b;
    MemoryValue res;
};

} // namespace bb::avm2::simulation
