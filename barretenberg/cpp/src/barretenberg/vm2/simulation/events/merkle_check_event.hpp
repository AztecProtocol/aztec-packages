#pragma once

#include "barretenberg/vm2/common/field.hpp"

#include <cstdint>
#include <vector>

namespace bb::avm2::simulation {

/* A Merkle check event has 2 flavors: READ (assert membership) or WRITE (write a new leaf).
 * The distinction between the two flavors in the event is not explicit but relies on the `new_leaf_value` field.
 * If `new_leaf_value` is present, it means the event is a WRITE event.
 * If `new_leaf_value` is absent, it means the event is a READ event.
 * Same for `new_root` field.
 * leaf_value, leaf_index, sibling_path, root are common to both flavors and are explicitly set for both flavors.
 */
struct MerkleCheckEvent {
    FF leaf_value = 0;
    std::optional<FF> new_leaf_value;
    uint64_t leaf_index = 0;
    std::vector<FF> sibling_path;
    FF root = 0;
    std::optional<FF> new_root;

    bool operator==(const MerkleCheckEvent& other) const = default;
};

} // namespace bb::avm2::simulation
