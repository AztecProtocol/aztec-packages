#pragma once

#include <vector>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

struct CalldataEvent {
    uint32_t context_id;
    uint32_t calldata_size;
    std::vector<FF> calldata;
};

} // namespace bb::avm2::simulation
