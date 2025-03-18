#pragma once

#include "barretenberg/vm2/common/field.hpp"

#include <cstdint>
#include <vector>

namespace bb::avm2::simulation {

struct MerkleCheckEvent {
    FF leaf_value;
    uint64_t leaf_index;
    std::vector<FF> sibling_path;
    FF root;

    bool operator==(const MerkleCheckEvent& other) const
    {
        return leaf_value == other.leaf_value && leaf_index == other.leaf_index && sibling_path == other.sibling_path &&
               root == other.root;
    }
};

} // namespace bb::avm2::simulation
