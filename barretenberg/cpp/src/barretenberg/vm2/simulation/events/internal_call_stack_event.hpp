#pragma once

#include <cstdint>

namespace bb::avm2::simulation {

using InternalPtrId = uint32_t;

struct InternalStackEvent {
    InternalPtrId id;
    InternalPtrId prev_id;
    uint32_t next_pc;
};

} // namespace bb::avm2::simulation
