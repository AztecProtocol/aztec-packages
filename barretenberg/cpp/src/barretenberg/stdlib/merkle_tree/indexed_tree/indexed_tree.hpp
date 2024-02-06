#pragma once
#include "../../../common/thread.hpp"
#include "../hash.hpp"
#include "../hash_path.hpp"
#include "../hasher.hpp"
#include "indexed_leaf.hpp"

namespace bb::stdlib::merkle_tree {

using namespace bb;

typedef uint256_t index_t;

class LevelSignal {
  public:
    LevelSignal(size_t initial_level)
        : signal_(initial_level){};
    ~LevelSignal(){};
    LevelSignal(const LevelSignal& other)
        : signal_(other.signal_.load())
    {}
    LevelSignal(const LevelSignal&& other) = delete;

    void wait_for_level(size_t level)
    {
        size_t current_level = signal_.load();
        while (current_level > level) {
            signal_.wait(current_level);
            current_level = signal_.load();
        }
        // while (signal_.load() > level);
    }

    void signal_level(size_t level)
    {
        signal_.store(level);
        signal_.notify_all();
    }

  private:
    std::atomic<size_t> signal_;
};

template <typename Store, typename LeavesStore> class IndexedTree {
  public:
    IndexedTree(Hasher& hasher, Store& store, size_t depth, size_t initial_size = 1, uint8_t tree_id = 0);
    IndexedTree(IndexedTree const& other) = delete;
    IndexedTree(IndexedTree&& other) = delete;
    ~IndexedTree();

    std::vector<fr_hash_path> update_element(const fr& value);
    std::vector<fr_hash_path> update_elements(const std::vector<fr>& values, bool no_multithreading = false);

    index_t get_size();
    fr get_root();

    fr_hash_path get_hash_path(const index_t& index);

  private:
    fr update_leaf_and_hash_to_root(const index_t& index, const indexed_leaf& leaf);
    fr update_leaf_and_hash_to_root(const index_t& index,
                                    const indexed_leaf& leaf,
                                    LevelSignal& leader,
                                    LevelSignal& follower,
                                    fr_hash_path& previous_hash_path);
    fr append_subtree(const index_t& start_index);
    fr get_element_or_zero(size_t level, const index_t& index);

    void write_node(size_t level, const index_t& index, const fr& value);
    std::pair<bool, fr> read_node(size_t level, const index_t& index);

  private:
    Hasher& hasher_;
    Store& store_;
    size_t depth_;
    uint8_t tree_id_;
    LeavesStore leaves_;
    std::vector<fr> zero_hashes_;
    fr root_;
};

template <typename Store, typename LeavesStore>
IndexedTree<Store, LeavesStore>::IndexedTree(
    Hasher& hasher, Store& store, size_t depth, size_t initial_size, uint8_t tree_id)
    : hasher_(hasher)
    , store_(store)
    , depth_(depth)
    , tree_id_(tree_id)
{
    ASSERT(depth >= 1 && depth <= 64);
    zero_hashes_.resize(depth);

    // Create the zero hashes for the tree
    auto current = hasher_.zero_hash();
    for (size_t i = depth - 1; i > 0; --i) {
        zero_hashes_[i] = current;
        current = hasher_.hash_pair(current, current);
    }
    zero_hashes_[0] = current;

    for (size_t i = 0; i < initial_size; i++) {
        // Insert the zero leaf to the `leaves` and also to the tree at index 0.
        indexed_leaf initial_leaf = indexed_leaf{ .value = i, .nextIndex = i + 1, .nextValue = i + 1 };
        leaves_.append_leaf(initial_leaf);
        root_ = update_leaf_and_hash_to_root(i, initial_leaf);
    }
}

template <typename Store, typename LeavesStore> IndexedTree<Store, LeavesStore>::~IndexedTree() {}

template <typename Store, typename LeavesStore>
std::vector<fr_hash_path> IndexedTree<Store, LeavesStore>::update_element(const fr& value)
{
    return update_elements(std::vector<fr>(1, value));
}

template <typename Store, typename LeavesStore>
std::vector<fr_hash_path> IndexedTree<Store, LeavesStore>::update_elements(const std::vector<fr>& values,
                                                                           bool no_multithreading)
{
    struct {
        bool operator()(const std::pair<fr, size_t>& a, const std::pair<fr, size_t>& b) const
        {
            return uint256_t(a.first) > uint256_t(b.first);
        }
    } comp;
    std::vector<std::pair<fr, size_t>> values_sorted(values.size());
    for (size_t i = 0; i < values.size(); ++i) {
        values_sorted[i] = std::make_pair(values[i], i);
    }
    std::sort(values_sorted.begin(), values_sorted.end(), comp);

    struct leaf_insertion {
        index_t low_leaf_index;
        indexed_leaf low_leaf;
    };

    std::vector<leaf_insertion> insertions(values.size());
    index_t old_size = leaves_.get_size();

    for (size_t i = 0; i < values_sorted.size(); ++i) {
        fr value = values_sorted[i].first;
        index_t index_of_new_leaf = index_t(values_sorted[i].second) + old_size;

        index_t current;
        bool is_already_present;
        std::tie(is_already_present, current) = leaves_.find_low_value(values_sorted[i].first);
        indexed_leaf current_leaf = leaves_.get_leaf(current);

        indexed_leaf new_leaf =
            indexed_leaf{ .value = value, .nextIndex = current_leaf.nextIndex, .nextValue = current_leaf.nextValue };

        if (!is_already_present) {
            // Update the current leaf to point it to the new leaf
            current_leaf.nextIndex = index_of_new_leaf;
            current_leaf.nextValue = value;

            leaves_.set_at_index(current, current_leaf, false);
            leaves_.set_at_index(index_of_new_leaf, new_leaf, true);
        }

        leaf_insertion& j = insertions[i];
        j.low_leaf_index = current;
        j.low_leaf = indexed_leaf{ .value = current_leaf.value,
                                   .nextIndex = current_leaf.nextIndex,
                                   .nextValue = current_leaf.nextValue };
    }

    std::vector<fr_hash_path> paths(insertions.size());
    std::vector<LevelSignal> signals;
    signals.emplace_back(size_t(0));
    for (size_t i = 0; i < insertions.size(); ++i) {
        signals.emplace_back(size_t(1 + depth_));
    }

    if (no_multithreading) {
        for (size_t i = 0; i < insertions.size(); i++) {
            leaf_insertion& j = insertions[i];
            update_leaf_and_hash_to_root(j.low_leaf_index, j.low_leaf, signals[i], signals[i + 1], paths[i]);
        }
    } else {
        parallel_for(insertions.size(), [&](size_t i) {
            leaf_insertion& j = insertions[i];
            update_leaf_and_hash_to_root(j.low_leaf_index, j.low_leaf, signals[i], signals[i + 1], paths[i]);
        });
    }

    root_ = append_subtree(old_size);

    return paths;
}

template <typename Store, typename LeavesStore>
fr IndexedTree<Store, LeavesStore>::append_subtree(const index_t& start_index)
{
    index_t index = start_index;
    size_t number_to_insert = size_t(index_t(leaves_.get_size()) - index);
    size_t level = depth_;
    std::vector<fr> hashes = std::vector<fr>(number_to_insert);

    for (size_t i = 0; i < number_to_insert; i++) {
        index_t index_to_insert = index + i;
        hashes[i] = hasher_.hash_inputs(leaves_.get_leaf(size_t(index_to_insert)).get_hash_inputs());
        write_node(level, index_to_insert, hashes[i]);
    }

    while (number_to_insert > 1) {
        number_to_insert >>= 1;
        index >>= 1;
        --level;
        for (size_t i = 0; i < number_to_insert; i++) {
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
    return new_hash;
}

template <typename Store, typename LeavesStore>
fr IndexedTree<Store, LeavesStore>::update_leaf_and_hash_to_root(const index_t& leaf_index, const indexed_leaf& leaf)
{
    LevelSignal leader(0);
    LevelSignal follower(0);
    fr_hash_path hash_path;
    return update_leaf_and_hash_to_root(leaf_index, leaf, leader, follower, hash_path);
}

template <typename Store, typename LeavesStore>
fr IndexedTree<Store, LeavesStore>::update_leaf_and_hash_to_root(const index_t& leaf_index,
                                                                 const indexed_leaf& leaf,
                                                                 LevelSignal& leader,
                                                                 LevelSignal& follower,
                                                                 fr_hash_path& previous_hash_path)
{
    index_t index = leaf_index;
    size_t level = depth_;
    fr new_hash = hasher_.hash_inputs(leaf.get_hash_inputs());

    // wait until we see that our leader has cleared 'depth_ - 1' (i.e. the level above the leaves that we are about to
    // write into) this ensures that our leader is not still reading the leaves
    size_t leader_level = depth_ - 1;
    leader.wait_for_level(leader_level);

    bool is_right = bool(index & 0x01);
    // extract the current leaf hash values for the previous hash path
    fr current_right_value = get_element_or_zero(level, index + (is_right ? 0 : 1));
    fr current_left_value = get_element_or_zero(level, is_right ? (index - 1) : index);
    previous_hash_path.push_back(std::make_pair(current_left_value, current_right_value));

    // write the new leaf hash in place
    write_node(level, index, new_hash);
    follower.signal_level(level);

    while (level > 0) {

        // extract the current node values for the previous hash path
        if (level > 1) {
            size_t level_to_read = level - 1;
            leader_level = level_to_read;

            leader.wait_for_level(leader_level);

            index_t index_of_node_above = index >> 1;
            bool node_above_is_right = bool(index_of_node_above & 0x01);
            fr above_right_value =
                get_element_or_zero(level_to_read, index_of_node_above + (node_above_is_right ? 0 : 1));
            fr above_left_value = get_element_or_zero(
                level_to_read, node_above_is_right ? (index_of_node_above - 1) : index_of_node_above);
            previous_hash_path.push_back(std::make_pair(above_left_value, above_right_value));
        }

        // now that we have extracted the hash path from the row above
        // we can compute the new hash at that level and write it
        is_right = bool(index & 0x01);
        fr new_right_value = is_right ? new_hash : get_element_or_zero(level, index + 1);
        fr new_left_value = is_right ? get_element_or_zero(level, index - 1) : new_hash;
        new_hash = hasher_.hash_pair(new_left_value, new_right_value);
        index >>= 1;
        --level;
        if (level > 0) {
            // before we write we need to ensure that our leader has already written to the row above it
            // otherwise it could still be reading from this level
            leader_level = level - 1;
            leader.wait_for_level(leader_level);
        }

        write_node(level, index, new_hash);
        follower.signal_level(level);
    }
    return new_hash;
}

template <typename Store, typename LeavesStore> index_t IndexedTree<Store, LeavesStore>::get_size()
{
    return leaves_.get_size();
}

template <typename Store, typename LeavesStore> fr IndexedTree<Store, LeavesStore>::get_root()
{
    return root_;
}

template <typename Store, typename LeavesStore>
fr_hash_path IndexedTree<Store, LeavesStore>::get_hash_path(const index_t& index)
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

template <typename Store, typename LeavesStore>
fr IndexedTree<Store, LeavesStore>::get_element_or_zero(size_t level, const index_t& index)
{
    const std::pair<bool, fr> read_data = read_node(level, index);
    if (read_data.first) {
        return read_data.second;
    }
    ASSERT(level > 0 && level <= zero_hashes_.size());
    return zero_hashes_[level - 1];
}

template <typename Store, typename LeavesStore>
void IndexedTree<Store, LeavesStore>::write_node(size_t level, const index_t& index, const fr& value)
{
    std::vector<uint8_t> buf;
    write(buf, value);
    store_.put(level, size_t(index), buf);
}

template <typename Store, typename LeavesStore>
std::pair<bool, fr> IndexedTree<Store, LeavesStore>::read_node(size_t level, const index_t& index)
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