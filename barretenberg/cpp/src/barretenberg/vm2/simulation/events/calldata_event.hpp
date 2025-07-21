#pragma once

#include <vector>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

// todo(ilyas): this needs to be re-worked when actually constrained
struct CalldataEvent {
    uint32_t context_id;
    uint32_t calldata_length;
    std::vector<FF> calldata;
    FF output_hash;
};

} // namespace bb::avm2::simulation
