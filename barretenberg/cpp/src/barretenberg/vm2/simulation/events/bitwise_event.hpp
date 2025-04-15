#pragma once

#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

#include <cstdint>

namespace bb::avm2::simulation {

struct BitwiseEvent {
    BitwiseOperation operation;
    MemoryTag tag;
    uint128_t a;
    uint128_t b;
    uint128_t res;
};

} // namespace bb::avm2::simulation