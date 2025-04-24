#pragma once

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/lib/db_interfaces.hpp"

#include <cstdint>
#include <vector>

namespace bb::avm2::simulation {

using NullifierTreeLeafPreimage = IndexedLeaf<NullifierLeafValue>;

struct NullifierWriteData {
    FF updated_low_leaf_hash;
    FF new_leaf_hash;
    FF intermediate_root;

    bool operator==(const NullifierWriteData& other) const = default;
};

struct NullifierTreeCheckEvent {
    FF nullifier;
    AppendOnlyTreeSnapshot prev_snapshot;
    AppendOnlyTreeSnapshot next_snapshot;

    NullifierTreeLeafPreimage low_leaf_preimage;
    FF low_leaf_hash;
    uint64_t low_leaf_index;

    std::optional<NullifierWriteData> write_data;

    bool operator==(const NullifierTreeCheckEvent& other) const = default;
};

} // namespace bb::avm2::simulation
