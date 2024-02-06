#pragma once
#include "../hash_path.hpp"
#include "../hasher.hpp"

namespace bb::stdlib::merkle_tree {

using namespace bb;

typedef uint256_t index_t;

template <typename Store> class AppendOnlyTree {
  public:
    AppendOnlyTree(Hasher& hasher, Store& store, size_t depth, uint8_t tree_id = 0);
    AppendOnlyTree(AppendOnlyTree const& other) = delete;
    AppendOnlyTree(AppendOnlyTree&& other) = delete;
    virtual ~AppendOnlyTree();

    virtual fr add_value(const fr& value);
    virtual fr add_values(const std::vector<fr>& values);

    index_t size();
    fr root();
    size_t depth();
    fr_hash_path get_hash_path(const index_t& index);

  protected:
    fr get_element_or_zero(size_t level, const index_t& index);

    void write_node(size_t level, const index_t& index, const fr& value);
    std::pair<bool, fr> read_node(size_t level, const index_t& index);

    Hasher& hasher_;
    Store& store_;
    size_t depth_;
    uint8_t tree_id_;
    std::vector<fr> zero_hashes_;
    fr root_;
    index_t size_;
};

template <typename Store>
AppendOnlyTree<Store>::AppendOnlyTree(Hasher& hasher, Store& store, size_t depth, uint8_t tree_id)
    : hasher_(hasher)
    , store_(store)
    , depth_(depth)
    , tree_id_(tree_id)
{
    ASSERT(depth >= 1 && depth <= 64);
    zero_hashes_.resize(depth + 1);

    // Create the zero hashes for the tree
    auto current = hasher_.zero_hash();
    for (size_t i = depth; i > 0; --i) {
        zero_hashes_[i] = current;
        current = hasher_.hash_pair(current, current);
    }
    zero_hashes_[0] = current;
    root_ = current;
}

template <typename Store> AppendOnlyTree<Store>::~AppendOnlyTree() {}

template <typename Store> index_t AppendOnlyTree<Store>::size()
{
    return size_;
}

template <typename Store> fr AppendOnlyTree<Store>::root()
{
    return root_;
}

template <typename Store> size_t AppendOnlyTree<Store>::depth()
{
    return depth_;
}

template <typename Store> fr_hash_path AppendOnlyTree<Store>::get_hash_path(const index_t& index)
{
    fr_hash_path path;
    index_t current_index = index;

    for (size_t level = depth_; level > 0; --level) {
        bool is_right = bool(current_index & 0x01);
        fr right_value =
            is_right ? get_element_or_zero(level, current_index) : get_element_or_zero(level, current_index + 1);
        fr left_value =
            is_right ? get_element_or_zero(level, current_index - 1) : get_element_or_zero(level, current_index);
        path.push_back(std::make_pair(left_value, right_value));
        current_index >>= 1;
    }
    return path;
}

template <typename Store> fr AppendOnlyTree<Store>::add_value(const fr& value)
{
    return add_values(std::vector<fr>{ value });
}

template <typename Store> fr AppendOnlyTree<Store>::add_values(const std::vector<fr>& values)
{
    index_t index = size();
    size_t number_to_insert = values.size();
    size_t level = depth_;
    std::vector<fr> hashes = std::vector<fr>(number_to_insert);

    for (size_t i = 0; i < number_to_insert; ++i) {
        index_t index_to_insert = index + i;
        hashes[i] = values[i];
        write_node(level, index_to_insert, hashes[i]);
    }

    while (number_to_insert > 1) {
        number_to_insert >>= 1;
        index >>= 1;
        --level;
        for (size_t i = 0; i < number_to_insert; ++i) {
            hashes[i] = hasher_.hash_pair(hashes[i * 2], hashes[i * 2 + 1]);
            write_node(level, index + i, hashes[i]);
        }
    }

    fr new_hash = hashes[0];
    while (level > 0) {
        bool is_right = bool(index & 0x01);
        fr left_hash = is_right ? get_element_or_zero(level, index - 1) : new_hash;
        fr right_hash = is_right ? new_hash : get_element_or_zero(level, index + 1);
        new_hash = hasher_.hash_pair(left_hash, right_hash);
        index >>= 1;
        --level;
        write_node(level, index, new_hash);
    }
    size_ += values.size();
    root_ = new_hash;
    return root_;
}

template <typename Store> fr AppendOnlyTree<Store>::get_element_or_zero(size_t level, const index_t& index)
{
    const std::pair<bool, fr> read_data = read_node(level, index);
    if (read_data.first) {
        return read_data.second;
    }
    ASSERT(level > 0 && level < zero_hashes_.size());
    return zero_hashes_[level];
}

template <typename Store> void AppendOnlyTree<Store>::write_node(size_t level, const index_t& index, const fr& value)
{
    std::vector<uint8_t> buf;
    write(buf, value);
    store_.put(level, size_t(index), buf);
}

template <typename Store> std::pair<bool, fr> AppendOnlyTree<Store>::read_node(size_t level, const index_t& index)
{
    std::vector<uint8_t> buf;
    bool available = store_.get(level, size_t(index), buf);
    if (!available) {
        return std::make_pair(false, fr::zero());
    }
    fr value = from_buffer<fr>(buf, 0);
    return std::make_pair(true, value);
}

} // namespace bb::stdlib::merkle_tree