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
    MemoryAddress a_addr;
    MemoryAddress b_addr;
    MemoryAddress dst_addr;
    MemoryValue a;
    MemoryValue b;
    MemoryValue res;
};

} // namespace bb::avm2::simulation