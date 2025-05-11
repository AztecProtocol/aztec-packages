#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include <cstdint>

namespace bb::avm2::simulation {

using InternalCallId = uint32_t;

struct InternalCallStackEvent {
    InternalCallId id;
    InternalCallId return_id;
    PC return_pc;
};

} // namespace bb::avm2::simulation
