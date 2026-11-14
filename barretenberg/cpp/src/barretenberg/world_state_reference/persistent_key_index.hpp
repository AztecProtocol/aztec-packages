#pragma once

#include <cstdint>
#include <memory>
#include <optional>
#include <utility>

#include "barretenberg/numeric/uint256/uint256.hpp"

namespace bb::world_state {

/**
 * @brief An ordered map from a leaf key to its leaf index whose versions share structure.
 *
 * A treap with path copying: an insert copies O(log n) nodes and shares the rest, so copying the
 * index is copying one pointer, like PersistentMerkleTree. Priorities are a hash of the key, so the
 * shape depends only on the set of keys and every run builds the same tree.
 *
 * A key keeps the first index it was inserted with.
 */
class PersistentKeyIndex {
  public:
    using Key = numeric::uint256_t;

    std::optional<uint64_t> find(const Key& key) const
    {
        const Node* node = root_.get();
        while (node != nullptr) {
            if (key == node->key) {
                return node->index;
            }
            node = (key < node->key ? node->left : node->right).get();
        }
        return std::nullopt;
    }

    /** The entry with the largest key strictly below `key`. */
    std::optional<std::pair<Key, uint64_t>> predecessor(const Key& key) const
    {
        std::optional<std::pair<Key, uint64_t>> best;
        const Node* node = root_.get();
        while (node != nullptr) {
            if (node->key < key) {
                best = std::make_pair(node->key, node->index);
                node = node->right.get();
            } else {
                node = node->left.get();
            }
        }
        return best;
    }

    /** A copy of this index holding `key` at `index`, unless `key` is already present. */
    PersistentKeyIndex with(const Key& key, uint64_t index) const
    {
        if (find(key).has_value()) {
            return *this;
        }
        PersistentKeyIndex out;
        out.root_ = insert(root_, std::make_shared<const Node>(Node{ key, index, priority(key), nullptr, nullptr }));
        return out;
    }

  private:
    struct Node {
        Key key;
        uint64_t index;
        uint64_t priority;
        std::shared_ptr<const Node> left;
        std::shared_ptr<const Node> right;
    };
    using NodePtr = std::shared_ptr<const Node>;

    static uint64_t priority(const Key& key)
    {
        // splitmix64 over the key's limbs.
        uint64_t x = key.data[0] ^ (key.data[1] * 0x9e3779b97f4a7c15ULL) ^ (key.data[2] * 0xbf58476d1ce4e5b9ULL) ^
                     (key.data[3] * 0x94d049bb133111ebULL);
        x += 0x9e3779b97f4a7c15ULL;
        x = (x ^ (x >> 30)) * 0xbf58476d1ce4e5b9ULL;
        x = (x ^ (x >> 27)) * 0x94d049bb133111ebULL;
        return x ^ (x >> 31);
    }

    static NodePtr with_children(const NodePtr& node, NodePtr left, NodePtr right)
    {
        return std::make_shared<const Node>(
            Node{ node->key, node->index, node->priority, std::move(left), std::move(right) });
    }

    /** Splits `node` into the keys below `key` and the keys above it (`key` itself is absent). */
    static std::pair<NodePtr, NodePtr> split(const NodePtr& node, const Key& key)
    {
        if (!node) {
            return { nullptr, nullptr };
        }
        if (node->key < key) {
            auto [below, above] = split(node->right, key);
            return { with_children(node, node->left, std::move(below)), std::move(above) };
        }
        auto [below, above] = split(node->left, key);
        return { std::move(below), with_children(node, std::move(above), node->right) };
    }

    static NodePtr insert(const NodePtr& node, const NodePtr& fresh)
    {
        if (!node) {
            return fresh;
        }
        if (fresh->priority > node->priority) {
            auto [below, above] = split(node, fresh->key);
            return with_children(fresh, std::move(below), std::move(above));
        }
        if (fresh->key < node->key) {
            return with_children(node, insert(node->left, fresh), node->right);
        }
        return with_children(node, node->left, insert(node->right, fresh));
    }

    NodePtr root_;
};

} // namespace bb::world_state
