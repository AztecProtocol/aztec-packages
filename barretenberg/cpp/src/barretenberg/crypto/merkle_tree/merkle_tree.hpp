// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/net.hpp"
#include "barretenberg/numeric/bitop/count_leading_zeros.hpp"
#include "barretenberg/numeric/bitop/keep_n_lsb.hpp"
#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "hash_path.hpp"
#include "merkle_tree.hpp"
#include <iostream>
#include <sstream>

namespace bb::crypto::merkle_tree {

class MemoryStore;

template <typename Store, typename HashingPolicy> class MerkleTree {
  public:
    typedef uint256_t index_t;

    MerkleTree(Store& store, size_t depth, uint8_t tree_id = 0);
    MerkleTree(MerkleTree const& other) = delete;
    MerkleTree(MerkleTree&& other);
    ~MerkleTree();

    fr_hash_path get_hash_path(index_t index);

    fr_sibling_path get_sibling_path(index_t index);

    fr update_element(index_t index, fr const& value);

    fr root() const;

    size_t depth() const { return depth_; }

    index_t size() const;

  protected:
    void load_metadata();

    /**
     * Computes the root hash of a tree of `height`, that is empty other than `value` at `index`.
     *
     * @param height: The tree depth
     * @param index: the index of the non-empty leaf
     * @param value: the value to be stored in the non-empty leaf
     *
     * @see Check full documentation: https://hackmd.io/2zyJc6QhRuugyH8D78Tbqg?view
     */
    fr update_element(fr const& root, fr const& value, index_t index, size_t height);

    fr get_element(fr const& root, index_t index, size_t height);

    /**
     * Computes the root hash of a tree of `height`, that is empty other than `value` at `index`.
     *
     * @param height: The tree depth
     * @param index: the index of the non-empty leaf
     * @param value: the value to be stored in the non-empty leaf
     */
    fr compute_zero_path_hash(size_t height, index_t index, fr const& value);

    /**
     * Given child nodes `a` and `b` and index of `a`, compute their parent node `p` and store [p : (a, b)].
     *
     * @param a_index: the index of the child node `a`
     * @param a: child node
     * @param b: child node
     * @param height: the height of the parent node
     */
    fr binary_put(index_t a_index, fr const& a, fr const& b, size_t height);

    fr fork_stump(
        fr const& value1, index_t index1, fr const& value2, index_t index2, size_t height, size_t stump_height);

    /**
     * Stores a parent node and child nodes in the database as [key : (left, right)].
     *
     * @param key: The node value to be stored as key
     * @param left: the left child node
     * @param right: the right child node
     */
    void put(fr const& key, fr const& left, fr const& right);

    /**
     * Stores a stump [key : (value, index, true)] in the memory.
     * The additional byte `true` is to denote this is a stump.
     *
     * @param key: The node value to be stored as key
     * @param value: value of the non-empty leaf in the stump
     * @param index: the index of the non-empty leaf in the stump
     */
    void put_stump(fr const& key, index_t index, fr const& value);

    void remove(fr const& key);

  protected:
    Store& store_;
    std::vector<fr> zero_hashes_;
    size_t depth_;
    uint8_t tree_id_;
};

// Size of merkle tree nodes in bytes.
constexpr size_t REGULAR_NODE_SIZE = 64;
constexpr size_t STUMP_NODE_SIZE = 65;

template <typename T> inline bool bit_set(T const& index, size_t i)
{
    return bool((index >> i) & 0x1);
}

template <typename Store, typename HashingPolicy>
MerkleTree<Store, HashingPolicy>::MerkleTree(Store& store, size_t depth, uint8_t tree_id)
    : store_(store)
    , depth_(depth)
    , tree_id_(tree_id)
{
    BB_ASSERT_GTE(depth_, 1U);
    BB_ASSERT_LTE(depth, 256U);
    zero_hashes_.resize(depth);

    // Compute the zero values at each layer.
    auto current = fr(0);
    for (size_t i = 0; i < depth; ++i) {
        zero_hashes_[i] = current;
        current = HashingPolicy::hash_pair(current, current);
    }
}

template <typename Store, typename HashingPolicy>
MerkleTree<Store, HashingPolicy>::MerkleTree(MerkleTree&& other)
    : store_(other.store_)
    , zero_hashes_(std::move(other.zero_hashes_))
    , depth_(other.depth_)
    , tree_id_(other.tree_id_)
{}

template <typename Store, typename HashingPolicy> MerkleTree<Store, HashingPolicy>::~MerkleTree() {}

template <typename Store, typename HashingPolicy> fr MerkleTree<Store, HashingPolicy>::root() const
{
    std::vector<uint8_t> root;
    std::vector<uint8_t> key = { tree_id_ };
    bool status = store_.get(key, root);
    return status ? from_buffer<fr>(root) : HashingPolicy::hash_pair(zero_hashes_.back(), zero_hashes_.back());
}

template <typename Store, typename HashingPolicy>
typename MerkleTree<Store, HashingPolicy>::index_t MerkleTree<Store, HashingPolicy>::size() const
{
    std::vector<uint8_t> size_buf;
    std::vector<uint8_t> key = { tree_id_ };
    bool status = store_.get(key, size_buf);
    return status ? from_buffer<index_t>(size_buf, 32) : 0;
}

template <typename Store, typename HashingPolicy>
fr_hash_path MerkleTree<Store, HashingPolicy>::get_hash_path(index_t index)
{
    fr_hash_path path(depth_);

    std::vector<uint8_t> data;
    bool status = store_.get(root().to_buffer(), data);

    for (size_t i = depth_ - 1; i < depth_; --i) {
        if (!status) {
            // This is an empty subtree. Fill in zero value.
            path[i] = std::make_pair(zero_hashes_[i], zero_hashes_[i]);
            continue;
        }

        if (data.size() == REGULAR_NODE_SIZE) {
            // This is a regular node with left and right trees. Descend according to index path.
            auto left = from_buffer<fr>(data, 0);
            auto right = from_buffer<fr>(data, 32);
            path[i] = std::make_pair(left, right);
            bool is_right = bit_set(index, i);
            auto it = data.data() + (is_right ? 32 : 0);
            status = store_.get(std::vector<uint8_t>(it, it + 32), data);
        } else {
            // This is a stump. The hash path can be fully restored from this node.
            BB_ASSERT_EQ(data.size(),
                         STUMP_NODE_SIZE,
                         "We store: [key : (value, local_index, true)], i.e. 65-byte data, in a thump.");
            fr current = from_buffer<fr>(data, 0);
            index_t element_index = from_buffer<index_t>(data, 32);
            index_t subtree_index = numeric::keep_n_lsb(index, i + 1);
            index_t diff = element_index ^ subtree_index;

            if (diff < 2) {
                // Requesting path to either the same element in the stump, or it's partner element.
                // Starting at the bottom of the tree, compute the remaining path pairs.
                for (size_t j = 0; j <= i; ++j) {
                    bool is_right = bit_set(element_index, j);
                    if (is_right) {
                        path[j] = std::make_pair(zero_hashes_[j], current);
                    } else {
                        path[j] = std::make_pair(current, zero_hashes_[j]);
                    }
                    current = HashingPolicy::hash_pair(path[j].first, path[j].second);
                }
            } else {
                // Requesting path to a different, independent element.
                // We know that this element exists in an empty subtree, of height determined by the common bits in the
                // stumps index and the requested index.
                size_t common_bits = numeric::count_leading_zeros(diff);
                size_t common_height = sizeof(index_t) * 8 - common_bits - 1;

                for (size_t j = 0; j < common_height; ++j) {
                    path[j] = std::make_pair(zero_hashes_[j], zero_hashes_[j]);
                }
                current = compute_zero_path_hash(common_height, element_index, current);
                for (size_t j = common_height; j <= i; ++j) {
                    bool is_right = bit_set(element_index, j);
                    if (is_right) {
                        path[j] = std::make_pair(zero_hashes_[j], current);
                    } else {
                        path[j] = std::make_pair(current, zero_hashes_[j]);
                    }
                    current = HashingPolicy::hash_pair(path[j].first, path[j].second);
                }
            }
            break;
        }
    }

    return path;
}

template <typename Store, typename HashingPolicy>
fr_sibling_path MerkleTree<Store, HashingPolicy>::get_sibling_path(index_t index)
{
    fr_sibling_path path(depth_);

    std::vector<uint8_t> data;
    bool status = store_.get(root().to_buffer(), data);

    for (size_t i = depth_ - 1; i < depth_; --i) {
        if (!status) {
            // This is an empty subtree. Fill in zero value.
            path[i] = zero_hashes_[i];
            continue;
        }

        if (data.size() == REGULAR_NODE_SIZE) {
            // This is a regular node with left and right trees. Descend according to index path.
            bool is_right = bit_set(index, i);
            path[i] = from_buffer<fr>(data, is_right ? 0 : 32);

            auto it = data.data() + (is_right ? 32 : 0);
            status = store_.get(std::vector<uint8_t>(it, it + 32), data);
        } else {
            // This is a stump. The sibling path can be fully restored from this node.
            // In case of a stump, we store: [key : (value, local_index, true)], i.e. 65-byte data.
            BB_ASSERT_EQ(data.size(), STUMP_NODE_SIZE);
            fr current = from_buffer<fr>(data, 0);
            index_t element_index = from_buffer<index_t>(data, 32);
            index_t subtree_index = numeric::keep_n_lsb(index, i + 1);
            index_t diff = element_index ^ subtree_index;

            // Populate the sibling path with zero hashes.
            for (size_t j = 0; j <= i; ++j) {
                path[j] = zero_hashes_[j];
            }

            // If diff == 0, we are requesting the sibling path of the only non-zero element in the stump which is
            // populated only with zero hashes.
            if (diff == 1) {
                // Requesting path of the sibling of the non-zero leaf in the stump.
                // Set the bottom element of the path to the non-zero leaf (the rest is already populated correctly
                // with zero hashes).
                path[0] = current;
            } else if (diff > 1) {
                // Requesting path to a different, independent element.
                // We know that this element exists in an empty subtree, of height determined by the common bits in the
                // stumps index and the requested index.
                size_t common_bits = numeric::count_leading_zeros(diff);
                size_t common_height = sizeof(index_t) * 8 - common_bits - 1;

                // Insert the only non-zero sibling at the common height.
                path[common_height] = compute_zero_path_hash(common_height, element_index, current);
            }
            break;
        }
    }

    return path;
}

template <typename Store, typename HashingPolicy>
fr MerkleTree<Store, HashingPolicy>::update_element(index_t index, fr const& value)
{
    auto leaf = value;
    using serialize::write;
    std::vector<uint8_t> leaf_key;
    write(leaf_key, tree_id_);
    write(leaf_key, index);
    store_.put(leaf_key, to_buffer(leaf));

    auto r = update_element(root(), leaf, index, depth_);

    std::vector<uint8_t> meta_key = { tree_id_ };
    std::vector<uint8_t> meta_buf;
    write(meta_buf, r);
    write(meta_buf, index + 1);
    store_.put(meta_key, meta_buf);

    return r;
}

template <typename Store, typename HashingPolicy>
fr MerkleTree<Store, HashingPolicy>::binary_put(index_t a_index, fr const& a, fr const& b, size_t height)
{
    bool a_is_right = bit_set(a_index, height - 1);
    auto left = a_is_right ? b : a;
    auto right = a_is_right ? a : b;
    auto key = HashingPolicy::hash_pair(left, right);
    put(key, left, right);
    return key;
}

template <typename Store, typename HashingPolicy>
fr MerkleTree<Store, HashingPolicy>::fork_stump(
    fr const& value1, index_t index1, fr const& value2, index_t index2, size_t height, size_t common_height)
{
    if (height == common_height) {
        if (height == 1) {
            index1 = numeric::keep_n_lsb(index1, 1);
            index2 = numeric::keep_n_lsb(index2, 1);
            return binary_put(index1, value1, value2, height);
        } else {
            size_t stump_height = height - 1;
            index_t stump1_index = numeric::keep_n_lsb(index1, stump_height);
            index_t stump2_index = numeric::keep_n_lsb(index2, stump_height);

            fr stump1_hash = compute_zero_path_hash(stump_height, stump1_index, value1);
            fr stump2_hash = compute_zero_path_hash(stump_height, stump2_index, value2);
            put_stump(stump1_hash, stump1_index, value1);
            put_stump(stump2_hash, stump2_index, value2);
            return binary_put(index1, stump1_hash, stump2_hash, height);
        }
    } else {
        auto new_root = fork_stump(value1, index1, value2, index2, height - 1, common_height);
        return binary_put(index1, new_root, zero_hashes_[height - 1], height);
    }
}

template <typename Store, typename HashingPolicy>
fr MerkleTree<Store, HashingPolicy>::update_element(fr const& root, fr const& value, index_t index, size_t height)
{
    // Base layer of recursion at height = 0.
    if (height == 0) {
        return value;
    }

    std::vector<uint8_t> data;
    auto status = store_.get(root.to_buffer(), data);

    if (!status) {
        fr key = compute_zero_path_hash(height, index, value);
        put_stump(key, index, value);
        return key;
    }

    if (data.size() == STUMP_NODE_SIZE) {
        // We've come across a stump.
        index_t existing_index = from_buffer<index_t>(data, 32);

        if (existing_index == index) {
            // We are updating the stumps element. Easy update.
            fr new_hash = compute_zero_path_hash(height, index, value);
            put_stump(new_hash, existing_index, value);
            return new_hash;
        }

        fr existing_value = from_buffer<fr>(data, 0);
        size_t common_bits = numeric::count_leading_zeros(existing_index ^ index);
        size_t common_height = sizeof(index_t) * 8 - common_bits;

        return fork_stump(existing_value, existing_index, value, index, height, common_height);
    } else {
        BB_ASSERT_EQ(data.size(), REGULAR_NODE_SIZE, "If it's not a stump, the data size must be 64 bytes.");
        bool is_right = bit_set(index, height - 1);
        fr subtree_root = from_buffer<fr>(data, is_right ? 32 : 0);
        fr subtree_root_copy = subtree_root;
        auto left = from_buffer<fr>(data, 0);
        auto right = from_buffer<fr>(data, 32);
        subtree_root = update_element(subtree_root, value, numeric::keep_n_lsb(index, height - 1), height - 1);
        if (is_right) {
            right = subtree_root;
        } else {
            left = subtree_root;
        }
        auto new_root = HashingPolicy::hash_pair(left, right);
        put(new_root, left, right);

        // Remove the old node only while rolling back in recursion.
        if (!(subtree_root_copy == subtree_root)) {
            remove(subtree_root_copy);
        }
        return new_root;
    }
}

template <typename Store, typename HashingPolicy>
fr MerkleTree<Store, HashingPolicy>::compute_zero_path_hash(size_t height, index_t index, fr const& value)
{
    fr current = value;
    for (size_t i = 0; i < height; ++i) {
        bool is_right = bit_set(index, i);
        fr left, right;
        if (is_right) {
            left = zero_hashes_[i];
            right = current;
        } else {
            right = zero_hashes_[i];
            left = current;
        }
        current = HashingPolicy::hash_pair(left, right);
    }
    return current;
}

template <typename Store, typename HashingPolicy>
void MerkleTree<Store, HashingPolicy>::put(fr const& key, fr const& left, fr const& right)
{
    std::vector<uint8_t> value;
    write(value, left);
    write(value, right);
    store_.put(key.to_buffer(), value);
}

template <typename Store, typename HashingPolicy>
void MerkleTree<Store, HashingPolicy>::put_stump(fr const& key, index_t index, fr const& value)
{
    std::vector<uint8_t> buf;
    write(buf, value);
    write(buf, index);
    // Add an additional byte, to signify we are a stump.
    write(buf, true);
    store_.put(key.to_buffer(), buf);
}

template <typename Store, typename HashingPolicy> void MerkleTree<Store, HashingPolicy>::remove(fr const& key)
{
    store_.del(key.to_buffer());
}

} // namespace bb::crypto::merkle_tree
