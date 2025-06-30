#pragma once

#include <cstdint>
#include <vector>

#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

struct PublicDataSquashEvent {
    FF leaf_slot;
    uint32_t execution_id;

    bool operator==(const PublicDataSquashEvent& other) const = default;
};

} // namespace bb::avm2::simulation
