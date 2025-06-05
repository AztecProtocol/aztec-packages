#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include <cstdint>

namespace bb::avm2::simulation {

struct InternalCallStackEvent {
    uint32_t context_id;
    InternalCallPtr call_ptr;
};

} // namespace bb::avm2::simulation
