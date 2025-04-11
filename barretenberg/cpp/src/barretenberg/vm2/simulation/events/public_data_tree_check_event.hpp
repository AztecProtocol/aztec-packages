#pragma once

#include <cstdint>
#include <vector>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/lib/db_interfaces.hpp"

namespace bb::avm2::simulation {

using PublicDataTreeLeafPreimage = IndexedLeaf<PublicDataLeafValue>;

struct PublicDataWriteData {
    PublicDataTreeLeafPreimage updated_low_leaf_preimage;
    FF updated_low_leaf_hash;
    FF new_leaf_hash;
    FF intermediate_root;
    AppendOnlyTreeSnapshot next_snapshot;

    bool operator==(const PublicDataWriteData& other) const = default;
};

struct PublicDataTreeCheckEvent {
    FF value;
    FF slot;
    AppendOnlyTreeSnapshot prev_snapshot;

    PublicDataTreeLeafPreimage low_leaf_preimage;
    FF low_leaf_hash;
    uint64_t low_leaf_index;

    std::optional<PublicDataWriteData> write_data;

    bool operator==(const PublicDataTreeCheckEvent& other) const = default;
};

} // namespace bb::avm2::simulation
