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

// Specialization of std::hash for std::vector<FF> to be used as a key in unordered_flat_map.
// Used in raw_data_dbs and hinting_dbs
namespace std {
template <> struct hash<std::vector<bb::avm2::FF>> {
    size_t operator()(const std::vector<bb::avm2::FF>& vec) const
    {
        size_t seed = vec.size();
        for (const auto& item : vec) {
            seed ^= std::hash<bb::avm2::FF>{}(item) + 0x9e3779b9 + (seed << 6) + (seed >> 2);
        }
        return seed;
    }
};
} // namespace std
