#pragma once

#include <vector>

#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

struct ToRadixEvent {
    FF value;
    uint32_t radix;
    std::vector<uint8_t> limbs;

    bool operator==(const ToRadixEvent& other) const = default;
};

} // namespace bb::avm2::simulation
