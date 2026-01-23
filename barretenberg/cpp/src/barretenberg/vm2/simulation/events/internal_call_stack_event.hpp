#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::simulation {

struct InternalCallStackEvent {
    uint32_t context_id = 0;
    InternalCallId entered_call_id = 0;
    InternalCallId call_id = 0;
    InternalCallId return_call_id = 0;
    PC return_pc = 0;
};

} // namespace bb::avm2::simulation
