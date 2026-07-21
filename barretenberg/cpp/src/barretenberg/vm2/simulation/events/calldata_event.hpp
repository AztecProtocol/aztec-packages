#pragma once

#include <cstdint>
#include <vector>

#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

struct CalldataEvent {
    uint32_t context_id = 0;
    std::vector<FF> calldata;
    FF calldata_hash = 0;
};

} // namespace bb::avm2::simulation
