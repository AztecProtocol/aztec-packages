#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::simulation {

struct InternalCallStackEvent {
    uint32_t context_id;
    InternalCallId entered_call_id;
    InternalCallId id;
    InternalCallId return_id;
    PC return_pc;
};

} // namespace bb::avm2::simulation
