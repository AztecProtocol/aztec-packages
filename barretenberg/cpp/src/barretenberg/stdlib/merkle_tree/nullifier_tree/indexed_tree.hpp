#pragma once
#include "../hash.hpp"
#include "../hash_path.hpp"
#include "nullifier_leaf.hpp"

namespace bb::stdlib::merkle_tree {

using namespace bb;

template <typename Store> class IndexedTree {
  public:
    typedef uint256_t index_t;

    IndexedTree(Store& store, size_t depth, size_t initial_size = 1, uint8_t tree_id = 0);
    IndexedTree(IndexedTree const& other) = delete;
    IndexedTree(IndexedTree&& other) = delete;
    ~IndexedTree();

    std::vector<fr_hash_path> update_elements(const std::vector<fr>& values);

    index_t get_size();
    fr get_root();

    fr_hash_path get_hash_path(index_t index);

  private:
    fr_hash_path update_leaf_and_hash_to_root(index_t index, const WrappedNullifierLeaf& leaf);
    void append_subtree(index_t start_index);
    fr get_element_or_zero(size_t level, index_t index);
    void create_key(size_t level, index_t index, std::vector<uint8_t>& key);

    void write_node(size_t level, index_t index, const fr& value);
    std::pair<bool, fr> read_node(size_t level, index_t index);

  private:
    Store& store_;
    size_t depth_;
    uint8_t tree_id_;
    std::vector<WrappedNullifierLeaf> leaves_;
    std::vector<fr> zero_hashes_;
    fr root_;
};

template <typename Store>
IndexedTree<Store>::IndexedTree(Store& store, size_t depth, size_t initial_size, uint8_t tree_id)
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

    for (size_t i = 0; i < initial_size; i++) {
        // Insert the zero leaf to the `leaves` and also to the tree at index 0.
        WrappedNullifierLeaf initial_leaf =
            WrappedNullifierLeaf(nullifier_leaf{ .value = 0, .nextIndex = 0, .nextValue = 0 });
        leaves_.push_back(initial_leaf);
        update_leaf_and_hash_to_root(i, initial_leaf);
    }
}

template <typename Store> IndexedTree<Store>::~IndexedTree() {}

template <typename Store> std::vector<fr_hash_path> IndexedTree<Store>::update_elements(const std::vector<fr>& values)
{
    struct {
        bool operator()(fr a, fr b) const { return uint256_t(a) > uint256_t(b); }
    } comp;
    std::vector<fr> values_sorted = values;
    std::sort(values_sorted.begin(), values_sorted.end(), comp);

    struct job {
        index_t low_leaf_index;
        nullifier_leaf low_leaf;
        fr_hash_path hash_path;

        index_t new_leaf_index;
        nullifier_leaf new_leaf;
    };

    std::vector<job> jobs;
    size_t old_size = leaves_.size();

    leaves_.resize(leaves_.size() + values.size());

    for (size_t i = 0; i < values_sorted.size(); i++) {
        fr value = values_sorted[i];
        index_t index_of_new_leaf = 0;
        for (size_t i = 0; i < values.size(); i++) {
            if (values[i] == value) {
                index_of_new_leaf = i + old_size;
            }
        }

        size_t current;
        bool is_already_present;
        std::tie(current, is_already_present) = find_closest_leaf(leaves_, value);
        nullifier_leaf current_leaf = leaves_[current].unwrap();

        info("Index of new leaf ", index_of_new_leaf, " current ", current);

        nullifier_leaf new_leaf =
            nullifier_leaf{ .value = value, .nextIndex = current_leaf.nextIndex, .nextValue = current_leaf.nextValue };

        if (!is_already_present) {
            // Update the current leaf to point it to the new leaf
            current_leaf.nextIndex = index_of_new_leaf;
            current_leaf.nextValue = value;

            leaves_[current].set(current_leaf);
            info("Setting new leaf with value ", new_leaf.value, " at ", index_of_new_leaf);
            leaves_[size_t(index_of_new_leaf)] = new_leaf;
        }
        nullifier_leaf current_leaf_copy = nullifier_leaf{ .value = current_leaf.value,
                                                           .nextIndex = current_leaf.nextIndex,
                                                           .nextValue = current_leaf.nextValue };

        job j;
        j.low_leaf_index = current;
        j.low_leaf = current_leaf_copy;
        j.new_leaf = new_leaf;
        j.new_leaf_index = index_of_new_leaf;
        jobs.push_back(j);
    }

    std::vector<fr_hash_path> paths;
    for (size_t i = 0; i < jobs.size(); i++) {
        job& j = jobs[i];
        j.hash_path = update_leaf_and_hash_to_root(j.low_leaf_index, j.low_leaf);
        paths.push_back(j.hash_path);
    }

    append_subtree(old_size);

    return paths;
}

template <typename Store> void IndexedTree<Store>::append_subtree(index_t start_index)
{
    // info("Appending subtree at ", start_index);
    size_t number_to_insert = size_t(index_t(leaves_.size()) - start_index);
    size_t level = depth_;
    std::vector<fr> hashes = std::vector<fr>(number_to_insert);

    for (size_t i = 0; i < number_to_insert; i++) {
        index_t index_to_insert = start_index + i;
        hashes[i] = WrappedNullifierLeaf(leaves_[size_t(index_to_insert)]).hash();
        // info("Inserting leaf hash to ", index_to_insert);
        write_node(level, index_to_insert, hashes[i]);
    }

    while (number_to_insert > 1) {
        number_to_insert >>= 1;
        start_index >>= 1;
        --level;
        for (size_t i = 0; i < number_to_insert; i++) {
            hashes[i] = hash_pair_native(hashes[i * 2], hashes[i * 2 + 1]);
            write_node(level, start_index + i, hashes[i]);
        }
    }

    fr new_hash = hashes[0];
    // info("Hashing to root from level ", level);
    while (level > 0) {
        bool is_right = bool(start_index & 0x01);
        fr left_hash = is_right ? get_element_or_zero(level, start_index - 1) : new_hash;
        fr right_hash = is_right ? new_hash : get_element_or_zero(level, start_index + 1);
        new_hash = hash_pair_native(left_hash, right_hash);
        start_index >>= 1;
        --level;
        write_node(level, start_index, new_hash);
    }
    root_ = new_hash;
}

template <typename Store>
fr_hash_path IndexedTree<Store>::update_leaf_and_hash_to_root(index_t leaf_index, const WrappedNullifierLeaf& leaf)
{
    index_t index = leaf_index;
    size_t level = depth_;
    fr new_hash = leaf.hash();
    fr_hash_path previous_hash_path;

    bool is_right = bool(index & 0x01);
    // extract the current leaf hash values for the previous hash path
    fr current_right_value = get_element_or_zero(level, index + (is_right ? 0 : 1));
    fr current_left_value = get_element_or_zero(level, is_right ? (index - 1) : index);
    previous_hash_path.push_back(std::make_pair(current_left_value, current_right_value));

    // write the new leaf hash in place
    write_node(level, index, new_hash);

    while (level > 0) {

        // extract the current node values for the previous hash path
        if (level > 1) {
            index_t index_of_node_above = index >> 1;
            bool node_above_is_right = bool(index_of_node_above & 0x01);
            fr above_right_value = get_element_or_zero(level - 1, index_of_node_above + (node_above_is_right ? 0 : 1));
            fr above_left_value =
                get_element_or_zero(level - 1, node_above_is_right ? (index_of_node_above - 1) : index_of_node_above);
            previous_hash_path.push_back(std::make_pair(above_left_value, above_right_value));
        }

        // now that we have extracted the hash path from the row above
        // we can compute the new hash at that level and write it
        is_right = bool(index & 0x01);
        fr new_right_value = is_right ? new_hash : get_element_or_zero(level, index + 1);
        fr new_left_value = is_right ? get_element_or_zero(level, index - 1) : new_hash;
        // info("Hashing ", new_left_value, " : ", new_right_value);
        new_hash = hash_pair_native(new_left_value, new_right_value);
        // info("Hashed");
        index >>= 1;
        --level;
        write_node(level, index, new_hash);
    }
    root_ = new_hash;
    return previous_hash_path;
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
    // info("Returing zero hash for level ", level, " index ", index);
    return zero_hashes_[level - 1];
}

template <typename Store> void IndexedTree<Store>::create_key(size_t level, index_t index, std::vector<uint8_t>& key)
{
    write(key, level);
    write(key, index);
}

template <typename Store> void IndexedTree<Store>::write_node(size_t level, index_t index, const fr& value)
{
    // info("Writing to ", level, " : ", index, " ", value);
    //  std::vector<uint8_t> key;
    //  create_key(level, index, key);
    std::vector<uint8_t> buf;
    write(buf, value);
    store_.put(level, size_t(index), buf);
}
template <typename Store> std::pair<bool, fr> IndexedTree<Store>::read_node(size_t level, index_t index)
{
    // info("Reading from ", level, " : ", index);
    //  std::vector<uint8_t> key;
    //  create_key(level, index, key);
    std::vector<uint8_t> buf;
    bool available = store_.get(level, size_t(index), buf);
    if (!available) {
        // info("not found");
        return std::make_pair(false, fr::zero());
    }
    fr value = from_buffer<fr>(buf, 0);
    // info("Found ", value);
    return std::make_pair(true, value);
}

} // namespace bb::stdlib::merkle_tree