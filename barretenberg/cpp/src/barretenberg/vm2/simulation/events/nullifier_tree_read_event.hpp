#pragma once

#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/world_state/types.hpp"

#include <cstdint>
#include <vector>

namespace bb::avm2::simulation {

using NullifierTreeLeafPreimage = crypto::merkle_tree::IndexedLeaf<crypto::merkle_tree::NullifierLeafValue>;

struct NullifierTreeReadEvent {
    FF nullifier;
    FF root;

    NullifierTreeLeafPreimage low_leaf_preimage;
    FF low_leaf_hash;
    uint64_t low_leaf_index;

    bool operator==(const NullifierTreeReadEvent& other) const = default;
};

} // namespace bb::avm2::simulation
