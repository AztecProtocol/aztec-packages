#pragma once

#include <cstdint>

namespace bb::avm2::simulation {

struct ContextEvent {
    uint32_t whatever_is_needed = 0;
};

struct ContextStackEvent {
    uint32_t whatever_is_snapshot = 0;
};

} // namespace bb::avm2::simulation
