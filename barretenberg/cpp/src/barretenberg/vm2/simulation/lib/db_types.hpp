#pragma once

#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::simulation {

using NullifierTreeLeafPreimage = crypto::merkle_tree::IndexedLeaf<crypto::merkle_tree::NullifierLeafValue>;
using PublicDataTreeLeafPreimage = crypto::merkle_tree::IndexedLeaf<crypto::merkle_tree::PublicDataLeafValue>;

struct TreeCounters {
    uint32_t note_hash_counter;
    uint32_t nullifier_counter;
    uint32_t l2_to_l1_msg_counter;
    // public data tree counter is tracked via the written public data slots tree

    bool operator==(const TreeCounters& other) const = default;
};

} // namespace bb::avm2::simulation
