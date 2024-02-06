#pragma once
#include "../../../common/thread.hpp"
#include "../append_only_tree/append_only_tree.hpp"
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
    }

    void signal_level(size_t level)
    {
        signal_.store(level);
        signal_.notify_all();
    }

  private:
    std::atomic<size_t> signal_;
};

template <typename Store, typename LeavesStore> class IndexedTree : public AppendOnlyTree<Store> {
  public:
    IndexedTree(Hasher& hasher, Store& store, size_t depth, size_t initial_size = 1, uint8_t tree_id = 0);
    IndexedTree(IndexedTree const& other) = delete;
    IndexedTree(IndexedTree&& other) = delete;
    ~IndexedTree();

    fr_hash_path add_or_update_value(const fr& value);
    std::vector<fr_hash_path> add_or_update_values(const std::vector<fr>& values, bool no_multithreading = false);

    fr add_value(const fr& value) override;
    fr add_values(const std::vector<fr>& values) override;

    using AppendOnlyTree<Store>::get_hash_path;
    using AppendOnlyTree<Store>::root;
    using AppendOnlyTree<Store>::depth;

  private:
    fr update_leaf_and_hash_to_root(const index_t& index, const indexed_leaf& leaf);
    fr update_leaf_and_hash_to_root(const index_t& index,
                                    const indexed_leaf& leaf,
                                    LevelSignal& leader,
                                    LevelSignal& follower,
                                    fr_hash_path& previous_hash_path);
    fr append_subtree(const index_t& start_index);

    using AppendOnlyTree<Store>::get_element_or_zero;
    using AppendOnlyTree<Store>::write_node;
    using AppendOnlyTree<Store>::read_node;

  private:
    using AppendOnlyTree<Store>::hasher_;
    using AppendOnlyTree<Store>::store_;
    using AppendOnlyTree<Store>::zero_hashes_;
    using AppendOnlyTree<Store>::depth_;
    using AppendOnlyTree<Store>::tree_id_;
    using AppendOnlyTree<Store>::root_;
    LeavesStore leaves_;
};

template <typename Store, typename LeavesStore>
IndexedTree<Store, LeavesStore>::IndexedTree(
    Hasher& hasher, Store& store, size_t depth, size_t initial_size, uint8_t tree_id)
    : AppendOnlyTree<Store>(hasher, store, depth, tree_id)
{
    ASSERT(depth >= 1 && depth <= 64);

    for (size_t i = 0; i < initial_size; ++i) {
        // Insert the zero leaf to the `leaves` and also to the tree at index 0.
        indexed_leaf initial_leaf = indexed_leaf{ .value = i, .nextIndex = i + 1, .nextValue = i + 1 };
        leaves_.append_leaf(initial_leaf);
    }
    append_subtree(0);
}

template <typename Store, typename LeavesStore> IndexedTree<Store, LeavesStore>::~IndexedTree() {}

template <typename Store, typename LeavesStore> fr IndexedTree<Store, LeavesStore>::add_value(const fr& value)
{
    return add_values(std::vector<fr>{ value });
}

template <typename Store, typename LeavesStore>
fr IndexedTree<Store, LeavesStore>::add_values(const std::vector<fr>& values)
{
    add_or_update_values(values);
    return root();
}

template <typename Store, typename LeavesStore>
fr_hash_path IndexedTree<Store, LeavesStore>::add_or_update_value(const fr& value)
{
    return add_or_update_values(std::vector<fr>{ value })[0];
}

template <typename Store, typename LeavesStore>
std::vector<fr_hash_path> IndexedTree<Store, LeavesStore>::add_or_update_values(const std::vector<fr>& values,
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

        leaf_insertion& insertion = insertions[i];
        insertion.low_leaf_index = current;
        insertion.low_leaf = indexed_leaf{ .value = current_leaf.value,
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
        for (size_t i = 0; i < insertions.size(); ++i) {
            leaf_insertion& insertion = insertions[i];
            update_leaf_and_hash_to_root(
                insertion.low_leaf_index, insertion.low_leaf, signals[i], signals[i + 1], paths[i]);
        }
    } else {
        parallel_for(insertions.size(), [&](size_t i) {
            leaf_insertion& insertion = insertions[i];
            update_leaf_and_hash_to_root(
                insertion.low_leaf_index, insertion.low_leaf, signals[i], signals[i + 1], paths[i]);
        });
    }

    root_ = append_subtree(old_size);

    return paths;
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

template <typename Store, typename LeavesStore>
fr IndexedTree<Store, LeavesStore>::append_subtree(const index_t& start_index)
{
    index_t index = start_index;
    size_t number_to_insert = size_t(index_t(leaves_.get_size()) - index);
    std::vector<fr> hashes_to_append = std::vector<fr>(number_to_insert);

    for (size_t i = 0; i < number_to_insert; i++) {
        index_t index_to_insert = index + i;
        hashes_to_append[i] = hasher_.hash_inputs(leaves_.get_leaf(size_t(index_to_insert)).get_hash_inputs());
    }

    return AppendOnlyTree<Store>::add_values(hashes_to_append);
}

} // namespace bb::stdlib::merkle_tree