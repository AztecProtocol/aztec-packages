#pragma once

#include <cstddef>
#include <cstdint>
#include <unordered_map>
#include <vector>

#include "barretenberg/common/assert.hpp"
#include "barretenberg/crypto/merkle_tree/hash_path.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"

namespace bb::world_state {

using FF = bb::fr;

/**
 * @brief A sparse, full-height in-memory Merkle tree.
 *
 * Unlike crypto::merkle_tree::MemoryTree (dense, capped at depth 20) this stores only the nodes that
 * have been touched, so it works at the protocol tree heights (up to 42). Untouched subtrees collapse
 * to the precomputed zero-subtree roots z[level], where z[0] = 0 and z[i] = hash_pair(z[i-1], z[i-1]).
 *
 * Node hashing uses HashingPolicy::hash_pair, which for the Aztec policies is the domain-separated
 * Poseidon2 used by the AVM tree-check gadgets and by the WorldState, so roots and sibling paths produced
 * here match those produced by the WorldState for the same leaf set.
 *
 * Levels are numbered from the leaves: level 0 holds leaves, level `depth` holds the root.
 */
template <typename HashingPolicy> class SparseMemoryTree {
  public:
    explicit SparseMemoryTree(size_t depth)
        : depth_(depth)
        , zero_hashes_(depth + 1)
    {
        BB_ASSERT_GTE(depth, static_cast<size_t>(1));
        zero_hashes_[0] = FF::zero();
        for (size_t level = 1; level <= depth; ++level) {
            zero_hashes_[level] = HashingPolicy::hash_pair(zero_hashes_[level - 1], zero_hashes_[level - 1]);
        }
    }

    FF root() const { return get_node(depth_, 0); }

    size_t depth() const { return depth_; }

    // Returns the hash stored at (level, index), or the zero-subtree root for that level if untouched.
    FF get_node(size_t level, uint64_t index) const
    {
        auto it = nodes_.find(node_key(level, index));
        return it != nodes_.end() ? it->second : zero_hashes_[level];
    }

    // Sets the leaf at the given index to `value` and recomputes the affected path to the root.
    void update_element(uint64_t index, const FF& value)
    {
        FF current = value;
        uint64_t curr_index = index;
        set_node(0, curr_index, current);
        for (size_t level = 0; level < depth_; ++level) {
            uint64_t sibling_index = curr_index ^ 1ULL;
            FF sibling = get_node(level, sibling_index);
            bool index_is_even = (curr_index & 1ULL) == 0;
            current =
                index_is_even ? HashingPolicy::hash_pair(current, sibling) : HashingPolicy::hash_pair(sibling, current);
            curr_index >>= 1;
            set_node(level + 1, curr_index, current);
        }
    }

    crypto::merkle_tree::fr_sibling_path get_sibling_path(uint64_t index) const
    {
        crypto::merkle_tree::fr_sibling_path path(depth_);
        uint64_t curr_index = index;
        for (size_t level = 0; level < depth_; ++level) {
            path[level] = get_node(level, curr_index ^ 1ULL);
            curr_index >>= 1;
        }
        return path;
    }

  private:
    static uint64_t node_key(size_t level, uint64_t index)
    {
        // Pack (level, index) into a single key. Levels fit in the top 8 bits; indices never exceed
        // 2^depth <= 2^42, leaving ample room below the 8-bit level field.
        return (static_cast<uint64_t>(level) << 56) | index;
    }

    void set_node(size_t level, uint64_t index, const FF& value) { nodes_[node_key(level, index)] = value; }

    size_t depth_;
    std::vector<FF> zero_hashes_;
    std::unordered_map<uint64_t, FF> nodes_;
};

} // namespace bb::world_state
