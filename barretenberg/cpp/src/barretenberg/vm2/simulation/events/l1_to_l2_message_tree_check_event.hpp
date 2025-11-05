#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"

#include <cstdint>
#include <vector>

namespace bb::avm2::simulation {

struct L1ToL2MessageTreeCheckEvent {
    FF msg_hash;
    FF leaf_value;
    uint64_t leaf_index;
    AppendOnlyTreeSnapshot snapshot;

    bool operator==(const L1ToL2MessageTreeCheckEvent& other) const = default;
};

} // namespace bb::avm2::simulation
