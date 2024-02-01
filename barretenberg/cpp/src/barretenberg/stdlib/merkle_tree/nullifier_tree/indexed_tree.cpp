#include "indexed_tree.hpp"
#include "../hash.hpp"
#include "../memory_store.hpp"
#include "../merkle_tree.hpp"
#include "barretenberg/common/net.hpp"
#include "barretenberg/numeric/bitop/count_leading_zeros.hpp"
#include "barretenberg/numeric/bitop/keep_n_lsb.hpp"
#include "barretenberg/numeric/uint128/uint128.hpp"
#include <iostream>
#include <sstream>

namespace bb::stdlib::merkle_tree {

template <typename Store>
IndexedTree<Store>::IndexedTree(Store& store, size_t depth, uint8_t tree_id)
    : store_(store)
    , depth_(depth)
    , tree_id_(tree_id)
{
    ASSERT(depth >= 1 && depth <= 40);
    zero_hashes_.resize(depth);

    // Create the zero hashes for the tree
    auto current = WrappedNullifierLeaf::zero().hash();
    for (size_t i = depth - 1; i > 0; --i) {
        zero_hashes_[i] = current;
        current = hash_pair_native(current, current);
    }
    zero_hashes_[0] = current;

    // Compute the zero values at each layer.
    // Insert the zero leaf to the `leaves` and also to the tree at index 0.
    WrappedNullifierLeaf initial_leaf =
        WrappedNullifierLeaf(nullifier_leaf{ .value = 0, .nextIndex = 0, .nextValue = 0 });
    leaves_.push_back(initial_leaf);
    update_leaf_and_hash_to_root(0, initial_leaf);
}

template <typename Store> IndexedTree<Store>::~IndexedTree() {}

template <typename Store> fr_hash_path IndexedTree<Store>::update_element(fr const& value)
{
    // Find the leaf with the value closest and less than `value`
    fr_hash_path hash_path;
    size_t current;
    bool is_already_present;
    std::tie(current, is_already_present) = find_closest_leaf(leaves_, value);

    nullifier_leaf current_leaf = leaves_[current].unwrap();
    WrappedNullifierLeaf new_leaf = WrappedNullifierLeaf(
        { .value = value, .nextIndex = current_leaf.nextIndex, .nextValue = current_leaf.nextValue });
    if (!is_already_present) {
        // Update the current leaf to point it to the new leaf
        current_leaf.nextIndex = leaves_.size();
        current_leaf.nextValue = value;

        leaves_[current].set(current_leaf);

        // Insert the new leaf with (nextIndex, nextValue) of the current leaf
        leaves_.push_back(new_leaf);
    }
    hash_path = get_hash_path(current);
    // Update the old leaf in the tree
    index_t old_leaf_index = current;
    update_leaf_and_hash_to_root(old_leaf_index, leaves_[current]);

    // Insert the new leaf in the tree
    index_t new_leaf_index = is_already_present ? old_leaf_index : leaves_.size() - 1;
    update_leaf_and_hash_to_root(new_leaf_index, new_leaf);

    return hash_path;
}

template <typename Store> std::vector<fr_hash_path> IndexedTree<Store>::update_elements(const std::vector<fr>& values)
{
    std::vector<fr_hash_path> paths;
    for (const fr v : values) {
        paths.push_back(update_element(v));
    }
    return paths;
}

template <typename Store>
void IndexedTree<Store>::update_leaf_and_hash_to_root(index_t leaf_index, const WrappedNullifierLeaf& leaf)
{
    index_t index = leaf_index;
    size_t level = depth_;
    fr new_hash = leaf.hash();
    write_node(level, index, new_hash);
    while (level > 0) {
        bool is_right = bool(index & 0x01);
        fr right_value = is_right ? new_hash : get_element_or_zero(level, index + 1);
        fr left_value = is_right ? get_element_or_zero(level, index - 1) : new_hash;
        new_hash = hash_pair_native(left_value, right_value);
        index >>= 1;
        --level;
        write_node(level, index, new_hash);
    }
    root_ = new_hash;
}

template <typename Store> index_t IndexedTree<Store>::get_size()
{
    return leaves_.size();
}

template <typename Store> fr IndexedTree<Store>::get_root()
{
    return root_;
}

template <typename Store> fr_hash_path IndexedTree<Store>::get_hash_path(index_t index)
{
    fr_hash_path path;

    for (size_t level = depth_; level > 0; --level) {
        bool is_right = bool(index & 0x01);
        fr right_value = is_right ? get_element_or_zero(level, index) : get_element_or_zero(level, index + 1);
        fr left_value = is_right ? get_element_or_zero(level, index - 1) : get_element_or_zero(level, index);
        path.push_back(std::make_pair(left_value, right_value));
        index >>= 1;
    }
    return path;
}

template <typename Store> fr IndexedTree<Store>::get_element_or_zero(size_t level, index_t index)
{
    const std::pair<bool, fr> read_data = read_node(level, index);
    if (read_data.first) {
        return read_data.second;
    }
    return zero_hashes_[level - 1];
}

template <typename Store> void IndexedTree<Store>::create_key(size_t level, index_t index, std::vector<uint8_t>& key)
{
    write(key, level);
    write(key, index);
}

template <typename Store> void IndexedTree<Store>::write_node(size_t level, index_t index, const fr& value)
{
    std::vector<uint8_t> key;
    create_key(level, index, key);
    std::vector<uint8_t> buf;
    write(buf, value);
    store_.put(key, buf);
}
template <typename Store> std::pair<bool, fr> IndexedTree<Store>::read_node(size_t level, index_t index)
{
    std::vector<uint8_t> key;
    create_key(level, index, key);
    std::vector<uint8_t> buf;
    bool available = store_.get(key, buf);
    if (!available) {
        return std::make_pair(false, fr::zero());
    }
    fr value = from_buffer<fr>(buf, 0);
    return std::make_pair(true, value);
}

} // namespace bb::stdlib::merkle_tree