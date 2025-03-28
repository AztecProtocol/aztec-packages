#pragma once

#include "barretenberg/vm2/common/field.hpp"

#include <cstdint>
#include <vector>

namespace bb::avm2::simulation {

struct MerkleCheckEvent {
    FF leaf_value;
    std::optional<FF> new_leaf_value;
    uint64_t leaf_index;
    std::vector<FF> sibling_path;
    FF root;
    std::optional<FF> new_root;

    bool operator==(const MerkleCheckEvent& other) const = default;
};

} // namespace bb::avm2::simulation
