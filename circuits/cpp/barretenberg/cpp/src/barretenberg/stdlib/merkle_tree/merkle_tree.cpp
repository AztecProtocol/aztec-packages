#include "merkle_tree.hpp"
#include "hash.hpp"
#include "memory_store.hpp"
#include "barretenberg/common/net.hpp"
#include <iostream>
#include "barretenberg/numeric/bitop/count_leading_zeros.hpp"
#include "barretenberg/numeric/bitop/keep_n_lsb.hpp"
#include "barretenberg/numeric/uint128/uint128.hpp"
#include <sstream>

namespace proof_system::plonk {
namespace stdlib {
namespace merkle_tree {

using namespace barretenberg;

template <typename T> inline bool bit_set(T const& index, size_t i)
{
    return bool((index >> i) & 0x1);
}

template <typename Store>
MerkleTree<Store>::MerkleTree(Store& store, size_t depth, uint8_t tree_id)
    : store_(store)
    , depth_(depth)
    , tree_id_(tree_id)
{
    ASSERT(depth_ >= 1 && depth <= 256);
    zero_hashes_.resize(depth);

    // Compute the zero values at each layer.
    auto current = fr(0);
    for (size_t i = 0; i < depth; ++i) {
        zero_hashes_[i] = current;
        current = hash_pair_native(current, current);
    }
}

template <typename Store>
MerkleTree<Store>::MerkleTree(MerkleTree&& other)
    : store_(other.store_)
    , zero_hashes_(std::move(other.zero_hashes_))
    , depth_(other.depth_)
    , tree_id_(other.tree_id_)
{}

template <typename Store> MerkleTree<Store>::~MerkleTree() {}

template <typename Store> fr MerkleTree<Store>::root() const
{
    std::vector<uint8_t> root;
    std::vector<uint8_t> key = { tree_id_ };
    bool status = store_.get(key, root);
    return status ? from_buffer<fr>(root) : hash_pair_native(zero_hashes_.back(), zero_hashes_.back());
}

template <typename Store> typename MerkleTree<Store>::index_t MerkleTree<Store>::size() const
{
    std::vector<uint8_t> size_buf;
    std::vector<uint8_t> key = { tree_id_ };
    bool status = store_.get(key, size_buf);
    return status ? from_buffer<index_t>(size_buf, 32) : 0;
}

template <typename Store> fr_hash_path MerkleTree<Store>::get_hash_path(index_t index)
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

        if (data.size() == 64) {
            // This is a regular node with left and right trees. Descend according to index path.
            auto left = from_buffer<fr>(data, 0);
            auto right = from_buffer<fr>(data, 32);
            path[i] = std::make_pair(left, right);
            bool is_right = bit_set(index, i);
            auto it = data.data() + (is_right ? 32 : 0);
            status = store_.get(std::vector<uint8_t>(it, it + 32), data);
        } else {
            // This is a stump. The hash path can be fully restored from this node.
            // In case of a stump, we store: [key : (value, local_index, true)], i.e. 65-byte data.
            ASSERT(data.size() == 65);
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
                    current = hash_pair_native(path[j].first, path[j].second);
                }
            } else {
                // Requesting path to a different, indepenent element.
                // We know that this element exits in an empty subtree, of height determined by the common bits in the
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
                    current = hash_pair_native(path[j].first, path[j].second);
                }
            }
            break;
        }
    }

    return path;
}

template <typename Store> fr MerkleTree<Store>::update_element(index_t index, fr const& value)
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

template <typename Store> fr MerkleTree<Store>::binary_put(index_t a_index, fr const& a, fr const& b, size_t height)
{
    bool a_is_right = bit_set(a_index, height - 1);
    auto left = a_is_right ? b : a;
    auto right = a_is_right ? a : b;
    auto key = hash_pair_native(left, right);
    put(key, left, right);
    return key;
}

template <typename Store>
fr MerkleTree<Store>::fork_stump(
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

template <typename Store>
fr MerkleTree<Store>::update_element(fr const& root, fr const& value, index_t index, size_t height)
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

    if (data.size() == 65) {
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
        // If its not a stump, the data size must be 64 bytes.
        ASSERT(data.size() == 64);
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
        auto new_root = hash_pair_native(left, right);
        put(new_root, left, right);

        // Remove the old node only while rolling back in recursion.
        if (!(subtree_root_copy == subtree_root)) {
            remove(subtree_root_copy);
        }
        return new_root;
    }
}

template <typename Store> fr MerkleTree<Store>::compute_zero_path_hash(size_t height, index_t index, fr const& value)
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
        current = hash_pair_native(left, right);
    }
    return current;
}

template <typename Store> void MerkleTree<Store>::put(fr const& key, fr const& left, fr const& right)
{
    std::vector<uint8_t> value;
    write(value, left);
    write(value, right);
    store_.put(key.to_buffer(), value);
}

template <typename Store> void MerkleTree<Store>::put_stump(fr const& key, index_t index, fr const& value)
{
    std::vector<uint8_t> buf;
    write(buf, value);
    write(buf, index);
    // Add an additional byte, to signify we are a stump.
    write(buf, true);
    store_.put(key.to_buffer(), buf);
}

template <typename Store> void MerkleTree<Store>::remove(fr const& key)
{
    store_.del(key.to_buffer());
}

template class MerkleTree<MemoryStore>;

} // namespace merkle_tree
} // namespace stdlib
} // namespace proof_system::plonk
