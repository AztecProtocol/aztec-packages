#pragma once

#include <vector>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

using EnqueuedCallId = uint8_t;

// todo(ilyas): this needs to be re-worked when actually constrained
struct CalldataHashingEvent {
    EnqueuedCallId enqueued_call_id;
    uint32_t calldata_length;
    std::vector<FF> calldata; // Replace with intermediate states
    FF output_hash;
};

struct CalldataEvent {
    std::vector<FF> calldata;
    EnqueuedCallId enqueued_call_id;
};

} // namespace bb::avm2::simulation
