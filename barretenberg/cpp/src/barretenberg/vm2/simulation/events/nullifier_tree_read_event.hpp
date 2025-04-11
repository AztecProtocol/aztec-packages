#pragma once

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/lib/db_interfaces.hpp"

#include <cstdint>
#include <vector>

namespace bb::avm2::simulation {

using NullifierTreeLeafPreimage = IndexedLeaf<NullifierLeafValue>;

struct NullifierTreeReadEvent {
    FF nullifier;
    FF root;

    NullifierTreeLeafPreimage low_leaf_preimage;
    FF low_leaf_hash;
    uint64_t low_leaf_index;

    bool operator==(const NullifierTreeReadEvent& other) const = default;
};

} // namespace bb::avm2::simulation
