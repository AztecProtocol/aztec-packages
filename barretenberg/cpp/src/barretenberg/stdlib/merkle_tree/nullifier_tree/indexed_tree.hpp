#pragma once
#include "../../../common/thread.hpp"
#include "../hash.hpp"
#include "../hash_path.hpp"
#include "nullifier_leaf.hpp"

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

class LeavesCache {
  public:
    index_t get_size();
    std::pair<bool, index_t> find_low_value(fr new_value);
    nullifier_leaf get_leaf(index_t index);
    void set_at_index(index_t index, const nullifier_leaf& leaf, bool add_to_index);
    void append_leaf(const nullifier_leaf& leaf);

  private:
    std::map<uint256_t, index_t> indices_;
    std::vector<nullifier_leaf> leaves_;
};

index_t LeavesCache::get_size()
{
    return index_t(leaves_.size());
}

std::pair<bool, index_t> LeavesCache::find_low_value(fr new_value)
{
    std::map<uint256_t, index_t>::const_iterator it = indices_.lower_bound(new_value);
    if (it == indices_.end()) {
        // there is no element >= the requested value.
        // decrement the iterator to get the value preceeding the requested value
        --it;
        // info("Found low value of ", new_value, " at index ", it->second);
        return std::make_pair(false, it->second);
    }
    if (it->first == new_value) {
        // the value is already present and the iterator points to it
        return std::make_pair(true, it->second);
    }
    // the iterator points to the element immediately larger than the requested value
    --it;
    // info("Found low value of ", new_value, " at index ", it->second);
    //  it now points to the value less than that requested
    return std::make_pair(false, it->second);
}
nullifier_leaf LeavesCache::get_leaf(index_t index)
{
    ASSERT(index >= 0 && index < leaves_.size());
    return leaves_[size_t(index)];
}
void LeavesCache::set_at_index(index_t index, const nullifier_leaf& leaf, bool add_to_index)
{
    if (index >= leaves_.size()) {
        leaves_.resize(size_t(index + 1));
    }
    leaves_[size_t(index)] = leaf;
    if (add_to_index) {
        indices_[uint256_t(leaf.value)] = index;
    }
}
void LeavesCache::append_leaf(const nullifier_leaf& leaf)
{
    index_t next_index = leaves_.size();
    set_at_index(next_index, leaf, true);
}

template <typename Store> class IndexedTree {
  public:
    IndexedTree(Store& store, size_t depth, size_t initial_size = 1, uint8_t tree_id = 0);
    IndexedTree(IndexedTree const& other) = delete;
    IndexedTree(IndexedTree&& other) = delete;
    ~IndexedTree();

    std::vector<fr_hash_path> update_element(const fr& value);
    std::vector<fr_hash_path> update_elements(const std::vector<fr>& values);

    index_t get_size();
    fr get_root();

    fr_hash_path get_hash_path(index_t index);

  private:
    fr update_leaf_and_hash_to_root(index_t index, const nullifier_leaf& leaf);
    fr update_leaf_and_hash_to_root(index_t index,
                                    const nullifier_leaf& leaf,
                                    LevelSignal& leader,
                                    LevelSignal& follower,
                                    fr_hash_path& previous_hash_path);
    fr append_subtree(index_t start_index);
    fr get_element_or_zero(size_t level, index_t index);
    void create_key(size_t level, index_t index, std::vector<uint8_t>& key);

    void write_node(size_t level, index_t index, const fr& value);
    std::pair<bool, fr> read_node(size_t level, index_t index);

  private:
    Store& store_;
    size_t depth_;
    uint8_t tree_id_;
    LeavesCache leaves_;
    std::vector<fr> zero_hashes_;
    fr root_;
};

template <typename Store>
IndexedTree<Store>::IndexedTree(Store& store, size_t depth, size_t initial_size, uint8_t tree_id)
    : store_(store)
    , depth_(depth)
    , tree_id_(tree_id)
{
    ASSERT(depth >= 1 && depth <= 64);
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
        nullifier_leaf initial_leaf = nullifier_leaf{ .value = i, .nextIndex = i + 1, .nextValue = i + 1 };
        leaves_.append_leaf(initial_leaf);
        root_ = update_leaf_and_hash_to_root(i, initial_leaf);
    }
}

template <typename Store> IndexedTree<Store>::~IndexedTree() {}

template <typename Store> std::vector<fr_hash_path> IndexedTree<Store>::update_element(const fr& value)
{
    return update_elements(std::vector<fr>(1, value));
}

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

    std::vector<job> jobs(values.size());
    index_t old_size = leaves_.get_size();

    for (size_t i = 0; i < values_sorted.size(); i++) {
        fr value = values_sorted[i];
        index_t index_of_new_leaf = 0;
        for (size_t i = 0; i < values.size(); i++) {
            if (values[i] == value) {
                index_of_new_leaf = index_t(i) + old_size;
            }
        }

        index_t current;
        bool is_already_present;
        std::tie(is_already_present, current) = leaves_.find_low_value(value);
        nullifier_leaf current_leaf = leaves_.get_leaf(current);

        // info("Index of new leaf ", index_of_new_leaf, " current ", current);

        nullifier_leaf new_leaf =
            nullifier_leaf{ .value = value, .nextIndex = current_leaf.nextIndex, .nextValue = current_leaf.nextValue };

        if (!is_already_present) {
            // Update the current leaf to point it to the new leaf
            current_leaf.nextIndex = index_of_new_leaf;
            current_leaf.nextValue = value;

            leaves_.set_at_index(current, current_leaf, false);
            // info("Setting new leaf with value ", new_leaf.value, " at ", index_of_new_leaf);
            leaves_.set_at_index(index_of_new_leaf, new_leaf, true);
        }
        nullifier_leaf current_leaf_copy = nullifier_leaf{ .value = current_leaf.value,
                                                           .nextIndex = current_leaf.nextIndex,
                                                           .nextValue = current_leaf.nextValue };

        job& j = jobs[i];
        j.low_leaf_index = current;
        j.low_leaf = current_leaf_copy;
        j.new_leaf = new_leaf;
        j.new_leaf_index = index_of_new_leaf;
    }

    std::vector<fr_hash_path> paths;
    std::vector<LevelSignal> signals;
    signals.emplace_back(size_t(0));
    for (size_t i = 0; i < jobs.size(); i++) {
        signals.emplace_back(size_t(1 + depth_));
    }

    parallel_for(jobs.size(), [&](size_t i) {
        job& j = jobs[i];
        update_leaf_and_hash_to_root(j.low_leaf_index, j.low_leaf, signals[i], signals[i + 1], j.hash_path);
    });
    // for (size_t i = 0; i < jobs.size(); i++) {
    //     job& j = jobs[i];
    //     update_leaf_and_hash_to_root(j.low_leaf_index, j.low_leaf, signals[i], signals[i + 1], j.hash_path);
    // }
    root_ = append_subtree(old_size);

    return paths;
}

template <typename Store> fr IndexedTree<Store>::append_subtree(index_t start_index)
{
    // info("Appending subtree at ", start_index);
    size_t number_to_insert = size_t(index_t(leaves_.get_size()) - start_index);
    size_t level = depth_;
    std::vector<fr> hashes = std::vector<fr>(number_to_insert);

    for (size_t i = 0; i < number_to_insert; i++) {
        index_t index_to_insert = start_index + i;
        hashes[i] = WrappedNullifierLeaf(leaves_.get_leaf(size_t(index_to_insert))).hash();
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
    return new_hash;
}

template <typename Store>
fr IndexedTree<Store>::update_leaf_and_hash_to_root(index_t leaf_index, const nullifier_leaf& leaf)
{
    LevelSignal leader(0);
    LevelSignal follower(0);
    fr_hash_path hash_path;
    return update_leaf_and_hash_to_root(leaf_index, leaf, leader, follower, hash_path);
}

template <typename Store>
fr IndexedTree<Store>::update_leaf_and_hash_to_root(index_t leaf_index,
                                                    const nullifier_leaf& leaf,
                                                    LevelSignal& leader,
                                                    LevelSignal& follower,
                                                    fr_hash_path& previous_hash_path)
{
    index_t index = leaf_index;
    size_t level = depth_;
    fr new_hash = WrappedNullifierLeaf(leaf).hash();
    // info("Hashed leaf to become ", new_hash);

    // wait until we see that our leader has cleared 'depth_ - 1' (i.e. the level above the leaves that we are about to
    // write into) this ensures that our leader is not still reading the leaves
    size_t leader_level = depth_ - 1;
    leader.wait_for_level(leader_level);
    // info("Worker Index ", worker_index, " signalled by leader at ", leader_level);

    bool is_right = bool(index & 0x01);
    // extract the current leaf hash values for the previous hash path
    fr current_right_value = get_element_or_zero(level, index + (is_right ? 0 : 1));
    fr current_left_value = get_element_or_zero(level, is_right ? (index - 1) : index);
    previous_hash_path.push_back(std::make_pair(current_left_value, current_right_value));

    // write the new leaf hash in place
    write_node(level, index, new_hash);
    // info("Worker index ", worker_index, " signalling follower at level ", level);
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
        // info("Hashing ", new_left_value, " : ", new_right_value);
        new_hash = hash_pair_native(new_left_value, new_right_value);
        index >>= 1;
        --level;
        if (level > 0) {
            // before we write we need to ensure that our leader has already written to the row above it
            // otherwise it could still be reading from this level
            leader_level = level - 1;
            leader.wait_for_level(leader_level);
        }

        write_node(level, index, new_hash);
        // info("Worker index ", worker_index, " signalling follower at level ", level);
        follower.signal_level(level);
    }
    return new_hash;
}

template <typename Store> index_t IndexedTree<Store>::get_size()
{
    return leaves_.get_size();
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
    // nfo("Returing zero hash for level ", level, " index ", index);
    if (level <= 0 || level > zero_hashes_.size()) {
        info("Level out of bounds for Zero Hashses ", level);
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
    // info("Writing to ", level, " : ", index, " ", value);
    //   std::vector<uint8_t> key;
    //   create_key(level, index, key);
    std::vector<uint8_t> buf;
    write(buf, value);
    store_.put(level, size_t(index), buf);
}
template <typename Store> std::pair<bool, fr> IndexedTree<Store>::read_node(size_t level, index_t index)
{
    // info("Reading from ", level, " : ", index);
    //   std::vector<uint8_t> key;
    //   create_key(level, index, key);
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