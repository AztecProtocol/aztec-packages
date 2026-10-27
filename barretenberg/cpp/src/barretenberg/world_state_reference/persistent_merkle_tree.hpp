#pragma once

#include <cstddef>
#include <cstdint>
#include <memory>
#include <span>
#include <vector>

#include "barretenberg/common/assert.hpp"
#include "barretenberg/crypto/merkle_tree/hash_path.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"

namespace bb::world_state {

/**
 * @brief A full-height Merkle tree whose versions share structure.
 *
 * Every node is immutable. A write copies the path from the root to the leaves it touches and shares
 * every other subtree with the version it was made from, so copying a tree is copying one pointer.
 * That is what makes a fork, a checkpoint or a per-block snapshot free. An empty subtree is a null
 * pointer and hashes to the zero-subtree root for its level.
 *
 * Each leaf may carry a payload (an indexed tree's leaf preimage). Node hashing is
 * HashingPolicy::hash_pair; the caller computes each leaf's hash.
 *
 * Levels are numbered from the leaves: level 0 holds leaves, level `depth` holds the root.
 */
template <typename HashingPolicy, typename Payload> class PersistentMerkleTree {
  public:
    using FF = bb::fr;

    struct Leaf {
        FF hash;
        std::shared_ptr<const Payload> payload;
    };

    explicit PersistentMerkleTree(size_t depth)
        : zero_hashes_(make_zero_hashes(depth))
    {}

    size_t depth() const { return zero_hashes_->size() - 1; }

    FF root() const { return hash_of(root_, depth()); }

    /** The hash at (level, index); untouched nodes are zero-subtree roots. */
    FF node(size_t level, uint64_t index) const
    {
        const Node* current = root_.get();
        for (size_t at = depth(); at > level && current != nullptr; --at) {
            current = current->children[bit(index, at - 1 - level)].get();
        }
        return hash_of(current, level);
    }

    FF leaf_hash(uint64_t index) const { return node(0, index); }

    /** The payload stored at `index`, or null when none was set. */
    const Payload* payload(uint64_t index) const
    {
        const Node* current = root_.get();
        for (size_t at = depth(); at > 0 && current != nullptr; --at) {
            current = current->children[bit(index, at - 1)].get();
        }
        return current != nullptr ? current->payload.get() : nullptr;
    }

    crypto::merkle_tree::fr_sibling_path sibling_path(uint64_t index) const { return subtree_sibling_path(index, 0); }

    /** The siblings from `level` up to the root of the subtree holding `index` at `level`. */
    crypto::merkle_tree::fr_sibling_path subtree_sibling_path(uint64_t index, size_t level) const
    {
        crypto::merkle_tree::fr_sibling_path path(depth() - level);
        std::vector<const Node*> siblings(depth() + 1, nullptr);
        const Node* current = root_.get();
        for (size_t at = depth(); at > level; --at) {
            size_t direction = bit(index, at - 1 - level);
            siblings[at - 1] = current != nullptr ? current->children[direction ^ 1].get() : nullptr;
            current = current != nullptr ? current->children[direction].get() : nullptr;
        }
        for (size_t at = level; at < depth(); ++at) {
            path[at - level] = hash_of(siblings[at], at);
        }
        return path;
    }

    /** A copy of this tree with the leaf at `index` set. */
    PersistentMerkleTree with_leaf(uint64_t index, Leaf leaf) const
    {
        PersistentMerkleTree out = *this;
        out.root_ = set(root_, depth(), 0, index, std::span<Leaf>(&leaf, 1));
        return out;
    }

    /** A copy of this tree with `leaves` written at consecutive indices from `start`, hashing each node once. */
    PersistentMerkleTree with_leaves(uint64_t start, std::span<Leaf> leaves) const
    {
        if (leaves.empty()) {
            return *this;
        }
        PersistentMerkleTree out = *this;
        out.root_ = set(root_, depth(), 0, start, leaves);
        return out;
    }

  private:
    struct Node {
        FF hash;
        std::shared_ptr<const Node> children[2];
        std::shared_ptr<const Payload> payload;
    };
    using NodePtr = std::shared_ptr<const Node>;

    static std::shared_ptr<const std::vector<FF>> make_zero_hashes(size_t depth)
    {
        BB_ASSERT_GTE(depth, static_cast<size_t>(1));
        auto zero_hashes = std::make_shared<std::vector<FF>>(depth + 1);
        (*zero_hashes)[0] = FF::zero();
        for (size_t level = 1; level <= depth; ++level) {
            (*zero_hashes)[level] = HashingPolicy::hash_pair((*zero_hashes)[level - 1], (*zero_hashes)[level - 1]);
        }
        return zero_hashes;
    }

    static size_t bit(uint64_t index, size_t position) { return static_cast<size_t>((index >> position) & 1ULL); }

    FF hash_of(const Node* node, size_t level) const { return node != nullptr ? node->hash : (*zero_hashes_)[level]; }
    FF hash_of(const NodePtr& node, size_t level) const { return hash_of(node.get(), level); }

    /**
     * Writes `leaves` (from leaf index `start`) into the subtree at `level` whose first leaf is `first`,
     * returning the new subtree. A subtree left with nothing but zero leaves and no payloads is null.
     */
    NodePtr set(const NodePtr& node, size_t level, uint64_t first, uint64_t start, std::span<Leaf> leaves) const
    {
        if (level == 0) {
            const Leaf& leaf = leaves[static_cast<size_t>(first - start)];
            if (leaf.hash.is_zero() && !leaf.payload) {
                return nullptr;
            }
            return std::make_shared<const Node>(Node{ .hash = leaf.hash, .children = {}, .payload = leaf.payload });
        }
        uint64_t half = uint64_t(1) << (level - 1);
        uint64_t end = start + leaves.size();
        NodePtr children[2] = { node ? node->children[0] : nullptr, node ? node->children[1] : nullptr };
        for (size_t side = 0; side < 2; ++side) {
            uint64_t child_first = first + side * half;
            uint64_t child_end = child_first + half;
            if (child_first < end && start < child_end) {
                children[side] = set(children[side], level - 1, child_first, start, leaves);
            }
        }
        if (!children[0] && !children[1]) {
            return nullptr;
        }
        FF hash = HashingPolicy::hash_pair(hash_of(children[0], level - 1), hash_of(children[1], level - 1));
        return std::make_shared<const Node>(
            Node{ .hash = hash, .children = { std::move(children[0]), std::move(children[1]) }, .payload = nullptr });
    }

    std::shared_ptr<const std::vector<FF>> zero_hashes_;
    NodePtr root_;
};

} // namespace bb::world_state
