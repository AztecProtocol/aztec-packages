#pragma once
#include "../../../common/thread.hpp"
#include "../append_only_tree/append_only_tree.hpp"
#include "../hash.hpp"
#include "../hash_path.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/thread_pool.hpp"
#include "indexed_leaf.hpp"
#include <atomic>
#include <cstdint>
#include <functional>
#include <iostream>
#include <memory>
#include <vector>

namespace bb::crypto::merkle_tree {

/**
 * @brief Used in parallel insertions in the the IndexedTree. Workers signal to other following workes as they move up
 * the level of the tree.
 *
 */
class Signal {
  public:
    Signal(uint32_t initial_level)
        : signal_(initial_level){};
    ~Signal() = default;
    Signal(const Signal& other)
        : signal_(other.signal_.load())
    {}
    Signal(const Signal&& other) noexcept
        : signal_(other.signal_.load())
    {}
    Signal& operator=(const Signal& other) = delete;
    Signal& operator=(const Signal&& other) = delete;

    /**
     * @brief Causes the thread to wait until the required level has been signalled
     * @param level The required level
     *
     */
    void wait_for_level(uint32_t level)
    {
        uint32_t current_level = signal_.load();
        while (current_level > level) {
            signal_.wait(current_level);
            current_level = signal_.load();
        }
    }

    /**
     * @brief Signals that the given level has been passed
     * @param level The level to be signalled
     *
     */
    void signal_level(uint32_t level)
    {
        signal_.store(level);
        signal_.notify_all();
    }

  private:
    std::atomic<uint32_t> signal_;
};

/**
 * @brief Implements a parallelised batch insertion indexed tree
 * Accepts template argument of the type of store backing the tree, the type of store containing the leaves and the
 * hashing policy
 *
 */
template <typename Store, typename HashingPolicy> class IndexedTree : public AppendOnlyTree<Store, HashingPolicy> {
  public:
    using LeafValueType = typename Store::LeafType;
    using IndexedLeafValueType = typename Store::IndexedLeafValueType;
    using add_completion_callback = std::function<void(std::vector<fr_hash_path>&, fr&, index_t)>;
    using leaf_callback = std::function<void(IndexedLeafValueType& leaf)>;

    IndexedTree(Store& store, ThreadPool& workers, index_t initial_size);
    IndexedTree(IndexedTree const& other) = delete;
    IndexedTree(IndexedTree&& other) = delete;
    ~IndexedTree() = default;
    IndexedTree& operator=(const IndexedTree& other) = delete;
    IndexedTree& operator=(IndexedTree&& other) = delete;

    /**
     * @brief Adds or updates a single values in the tree (updates not currently supported)
     * @param value The value to be added or updated
     * @returns The 'previous' hash paths of all updated values
     */
    void add_or_update_value(const LeafValueType& value, const add_completion_callback& completion);

    /**
     * @brief Adds or updates the given set of values in the tree (updates not currently supported)
     * @param values The values to be added or updated
     * @param no_multithreading Performs single threaded insertion, just used whilst prototyping and benchmarking
     * @returns The 'previous' hash paths of all updated values
     */
    void add_or_update_values(const std::vector<LeafValueType>& values, const add_completion_callback& completion);

    void get_leaf(const index_t& index, bool includeUncommitted, const leaf_callback& completion);

    using AppendOnlyTree<Store, HashingPolicy>::get_hash_path;

  private:
    using typename AppendOnlyTree<Store, HashingPolicy>::append_completion_callback;
    using ReadTransaction = typename Store::ReadTransaction;
    using ReadTransactionPtr = typename Store::ReadTransactionPtr;

    struct leaf_insertion {
        index_t low_leaf_index;
        IndexedLeafValueType low_leaf;
    };

    void update_leaf_and_hash_to_root(const index_t& index,
                                      const IndexedLeafValueType& leaf,
                                      Signal& leader,
                                      Signal& follower,
                                      fr_hash_path& previous_hash_path,
                                      ReadTransaction& tx);

    using insertion_generation_callback = std::function<void(std::shared_ptr<std::vector<leaf_insertion>>,
                                                             std::shared_ptr<std::vector<IndexedLeafValueType>>)>;
    void generate_insertions(const std::shared_ptr<std::vector<std::pair<LeafValueType, size_t>>>& values_to_be_sorted,
                             const insertion_generation_callback& completion);

    using insertion_completion_callback = std::function<void(std::shared_ptr<std::vector<fr_hash_path>> paths)>;
    void perform_insertions(std::shared_ptr<std::vector<leaf_insertion>> insertions,
                            const insertion_completion_callback& completion);

    using hash_generation_callback = std::function<void(std::shared_ptr<std::vector<fr>> hashes)>;
    void generate_hashes_for_appending(std::shared_ptr<std::vector<IndexedLeafValueType>> leaves_to_hash,
                                       const hash_generation_callback& completion);

    using AppendOnlyTree<Store, HashingPolicy>::get_element_or_zero;
    using AppendOnlyTree<Store, HashingPolicy>::write_node;
    using AppendOnlyTree<Store, HashingPolicy>::read_node;

    using AppendOnlyTree<Store, HashingPolicy>::add_value;
    using AppendOnlyTree<Store, HashingPolicy>::add_values;

    using AppendOnlyTree<Store, HashingPolicy>::store_;
    using AppendOnlyTree<Store, HashingPolicy>::zero_hashes_;
    using AppendOnlyTree<Store, HashingPolicy>::depth_;
    using AppendOnlyTree<Store, HashingPolicy>::name_;
    using AppendOnlyTree<Store, HashingPolicy>::workers_;
};

template <typename Store, typename HashingPolicy>
IndexedTree<Store, HashingPolicy>::IndexedTree(Store& store, ThreadPool& workers, index_t initial_size)
    : AppendOnlyTree<Store, HashingPolicy>(store, workers)
{
    ASSERT(initial_size > 0);
    zero_hashes_.resize(depth_ + 1);

    // Create the zero hashes for the tree
    // Indexed_LeafType zero_leaf{ 0, 0, 0 };
    auto current = fr::zero();
    for (uint32_t i = depth_; i > 0; --i) {
        zero_hashes_[i] = current;
        current = HashingPolicy::hash_pair(current, current);
    }
    zero_hashes_[0] = current;

    index_t stored_size = 0;
    bb::fr stored_root = fr::zero();
    {
        ReadTransactionPtr tx = store_.createReadTransaction();
        std::string name;
        uint32_t depth = 0;
        store_.get_full_meta(stored_size, stored_root, name, depth, *tx, false);
    }

    if (stored_size > 0) {
        return;
    }

    std::vector<IndexedLeafValueType> appended_leaves;
    std::vector<bb::fr> appended_hashes;
    // Inserts the initial set of leaves as a chain in incrementing value order
    for (uint32_t i = 0; i < initial_size; ++i) {
        // Insert the zero leaf to the `leaves` and also to the tree at index 0.
        bool last = i == (initial_size - 1);
        IndexedLeafValueType initial_leaf = IndexedLeafValueType(LeafValueType(i), last ? 0 : i + 1, last ? 0 : i + 1);
        appended_leaves.push_back(initial_leaf);
        appended_hashes.push_back(HashingPolicy::hash(initial_leaf.get_hash_inputs()));
        store_.set_at_index(i, initial_leaf, true);
    }

    Signal signal(1);
    append_completion_callback completion = [&](fr, index_t) -> void { signal.signal_level(0); };
    AppendOnlyTree<Store, HashingPolicy>::add_values(appended_hashes, completion);
    signal.wait_for_level(0);
    store_.commit();
}

template <typename Store, typename HashingPolicy>
void IndexedTree<Store, HashingPolicy>::get_leaf(const index_t& index,
                                                 bool includeUncommitted,
                                                 const leaf_callback& completion)
{
    auto job = [=]() {
        IndexedLeafValueType leaf;
        {
            ReadTransactionPtr tx = store_.createReadTransaction();
            leaf = store_.get_leaf(index, *tx, includeUncommitted);
        }
        completion(leaf);
    };
    workers_.enqueue(job);
}

template <typename Store, typename HashingPolicy>
void IndexedTree<Store, HashingPolicy>::add_or_update_value(const LeafValueType& value,
                                                            const add_completion_callback& completion)
{
    add_or_update_values(std::vector<LeafValueType>{ value }, completion);
}

template <typename Store, typename HashingPolicy>
void IndexedTree<Store, HashingPolicy>::add_or_update_values(const std::vector<LeafValueType>& values,
                                                             const add_completion_callback& completion)
{
    std::shared_ptr<std::vector<std::pair<LeafValueType, size_t>>> values_to_be_sorted =
        std::make_shared<std::vector<std::pair<LeafValueType, size_t>>>(values.size());
    for (size_t i = 0; i < values.size(); ++i) {
        (*values_to_be_sorted)[i] = std::make_pair(values[i], i);
    }

    struct IntermediateResults {
        std::shared_ptr<std::vector<fr>> hashes_to_append;
        std::shared_ptr<std::vector<fr_hash_path>> paths;
        std::atomic<uint32_t> count;

        IntermediateResults()
            : count(2){};
    };
    std::shared_ptr<IntermediateResults> results = std::make_shared<IntermediateResults>();

    append_completion_callback final_completion = [=](fr root, index_t size) {
        completion(*results->paths, root, size);
    };

    hash_generation_callback hash_completion = [=](const std::shared_ptr<std::vector<fr>>& hashes_to_append) {
        results->hashes_to_append = hashes_to_append;
        if (results->count.fetch_sub(1) == 1) {
            AppendOnlyTree<Store, HashingPolicy>::add_values(*hashes_to_append, final_completion);
        }
    };

    insertion_completion_callback insertion_completion = [=](const std::shared_ptr<std::vector<fr_hash_path>>& paths) {
        results->paths = paths;
        if (results->count.fetch_sub(1) == 1) {
            AppendOnlyTree<Store, HashingPolicy>::add_values(*results->hashes_to_append, final_completion);
        }
    };

    insertion_generation_callback insertion_generation_completed =
        [=](std::shared_ptr<std::vector<leaf_insertion>> insertions,
            std::shared_ptr<std::vector<IndexedLeafValueType>> leaves_to_append) {
            workers_.enqueue([=]() { generate_hashes_for_appending(leaves_to_append, hash_completion); });
            perform_insertions(insertions, insertion_completion);
        };
    workers_.enqueue([=]() { generate_insertions(values_to_be_sorted, insertion_generation_completed); });
}

template <typename Store, typename HashingPolicy>
void IndexedTree<Store, HashingPolicy>::perform_insertions(std::shared_ptr<std::vector<leaf_insertion>> insertions,
                                                           const insertion_completion_callback& completion)
{
    // We now kick off multiple workers to perform the low leaf updates
    // We create set of signals to coordinate the workers as the move up the tree
    std::shared_ptr<std::vector<fr_hash_path>> paths = std::make_shared<std::vector<fr_hash_path>>(insertions->size());
    std::shared_ptr<std::vector<Signal>> signals = std::make_shared<std::vector<Signal>>();
    // The first signal is set to 0. This ensures the first worker up the tree is not impeded
    signals->emplace_back(0);
    // Workers will follow their leaders up the tree, being triggered by the signal in front of them
    for (size_t i = 0; i < insertions->size(); ++i) {
        signals->emplace_back(uint32_t(1 + depth_));
    }
    for (uint32_t i = 0; i < insertions->size(); ++i) {
        auto op = [=]() {
            leaf_insertion& insertion = (*insertions)[i];
            {
                ReadTransactionPtr tx = store_.createReadTransaction();
                update_leaf_and_hash_to_root(
                    insertion.low_leaf_index, insertion.low_leaf, (*signals)[i], (*signals)[i + 1], (*paths)[i], *tx);
            }
            if (i == insertions->size() - 1) {
                completion(paths);
            }
        };
        workers_.enqueue(op);
    }
}

template <typename Store, typename HashingPolicy>
void IndexedTree<Store, HashingPolicy>::generate_hashes_for_appending(
    std::shared_ptr<std::vector<IndexedLeafValueType>> leaves_to_hash, const hash_generation_callback& completion)
{
    std::shared_ptr<std::vector<fr>> hashed = std::make_shared<std::vector<fr>>(leaves_to_hash->size());
    std::vector<IndexedLeafValueType>& leaves = *leaves_to_hash;
    for (uint32_t i = 0; i < leaves.size(); ++i) {
        (*hashed)[i] = HashingPolicy::hash(leaves[i].get_hash_inputs());
    }
    completion(hashed);
}

template <typename Store, typename HashingPolicy>
void IndexedTree<Store, HashingPolicy>::generate_insertions(
    const std::shared_ptr<std::vector<std::pair<LeafValueType, size_t>>>& values_to_be_sorted,
    const insertion_generation_callback& on_completion)
{
    // The first thing we do is sort the values into descending order but maintain knowledge of their orignal order
    struct {
        bool operator()(std::pair<LeafValueType, size_t>& a, std::pair<LeafValueType, size_t>& b) const
        {
            return uint256_t(a.first.get_fr_value()) > uint256_t(b.first.get_fr_value());
        }
    } comp;
    std::sort(values_to_be_sorted->begin(), values_to_be_sorted->end(), comp);

    std::vector<std::pair<LeafValueType, size_t>>& values = *values_to_be_sorted;

    // Now that we have the sorted values we need to identify the leaves that need updating.
    // This is performed sequentially and is stored in this 'leaf_insertion' struct
    std::shared_ptr<std::vector<leaf_insertion>> insertions =
        std::make_shared<std::vector<leaf_insertion>>(values.size());
    std::shared_ptr<std::vector<IndexedLeafValueType>> leaves_to_append =
        std::make_shared<std::vector<IndexedLeafValueType>>(values.size());
    index_t old_size = 0;
    {
        ReadTransactionPtr tx = store_.createReadTransaction();
        bb::fr old_root = fr::zero();
        store_.get_meta(old_size, old_root, *tx, true);
        for (size_t i = 0; i < values.size(); ++i) {
            fr value = values[i].first.get_fr_value();
            size_t index_into_appended_leaves = values[i].second;
            index_t index_of_new_leaf = static_cast<index_t>(index_into_appended_leaves) + old_size;

            // This gives us the leaf that need updating
            index_t current = 0;
            bool is_already_present = false;
            std::tie(is_already_present, current) = store_.find_low_value(values[i].first, true, *tx);
            IndexedLeafValueType current_leaf = store_.get_leaf(current, *tx, true);

            IndexedLeafValueType new_leaf =
                IndexedLeafValueType(values[i].first, current_leaf.nextIndex, current_leaf.nextValue);

            // We only handle new values being added. We don't yet handle values being updated
            if (!is_already_present) {
                // Update the current leaf to point it to the new leaf
                current_leaf.nextIndex = index_of_new_leaf;
                current_leaf.nextValue = value;
                store_.set_at_index(current, current_leaf, false);
                store_.set_at_index(index_of_new_leaf, new_leaf, true);
            } else {
            }

            (*leaves_to_append)[index_into_appended_leaves] = new_leaf;

            // Capture the index and value of the updated 'low' leaf as well as the new leaf to be appended
            leaf_insertion& insertion = (*insertions)[i];
            insertion.low_leaf_index = current;
            insertion.low_leaf =
                IndexedLeafValueType(current_leaf.value, current_leaf.nextIndex, current_leaf.nextValue);
        }
    }
    on_completion(insertions, leaves_to_append);
}

template <typename Store, typename HashingPolicy>
void IndexedTree<Store, HashingPolicy>::update_leaf_and_hash_to_root(const index_t& leaf_index,
                                                                     const IndexedLeafValueType& leaf,
                                                                     Signal& leader,
                                                                     Signal& follower,
                                                                     fr_hash_path& previous_hash_path,
                                                                     ReadTransaction& tx)
{
    auto get_node = [&](uint32_t level, index_t index) -> fr { return get_element_or_zero(level, index, tx, true); };
    // We are a worker at a specific leaf index.
    // We are going to move up the tree and at each node/level:
    // 1. Wait for the level above to become 'signalled' as clear for us to write into
    // 2. Read the node and it's sibling
    // 3. Write the new node value
    index_t index = leaf_index;
    uint32_t level = depth_;
    fr new_hash = HashingPolicy::hash(leaf.get_hash_inputs());

    // Wait until we see that our leader has cleared 'depth_ - 1' (i.e. the level above the leaves that we are about to
    // write into) this ensures that our leader is not still reading the leaves
    uint32_t leader_level = depth_ - 1;
    leader.wait_for_level(leader_level);

    // Extract the value of the leaf node and it's sibling
    bool is_right = static_cast<bool>(index & 0x01);
    // extract the current leaf hash values for the previous hash path
    fr current_right_value = get_node(level, index + (is_right ? 0 : 1));
    fr current_left_value = get_node(level, is_right ? (index - 1) : index);
    previous_hash_path.emplace_back(current_left_value, current_right_value);

    // Write the new leaf hash in place
    write_node(level, index, new_hash);
    // Signal that this level has been written
    follower.signal_level(level);

    while (level > 0) {
        if (level > 1) {
            // Level is > 1. Therefore we need to wait for our leader to have written to the level above meaning we can
            // read from it
            uint32_t level_to_read = level - 1;
            leader_level = level_to_read;
            leader.wait_for_level(leader_level);

            // Now read the node and it's sibling
            index_t index_of_node_above = index >> 1;
            bool node_above_is_right = static_cast<bool>(index_of_node_above & 0x01);
            fr above_right_value = get_node(level_to_read, index_of_node_above + (node_above_is_right ? 0 : 1));
            fr above_left_value =
                get_node(level_to_read, node_above_is_right ? (index_of_node_above - 1) : index_of_node_above);
            previous_hash_path.emplace_back(above_left_value, above_right_value);
        }

        // Now that we have extracted the hash path from the row above
        // we can compute the new hash at that level and write it
        is_right = static_cast<bool>(index & 0x01);
        fr new_right_value = is_right ? new_hash : get_node(level, index + 1);
        fr new_left_value = is_right ? get_node(level, index - 1) : new_hash;
        new_hash = HashingPolicy::hash_pair(new_left_value, new_right_value);
        index >>= 1;
        --level;
        if (level > 0) {
            // Before we write we need to ensure that our leader has already written to the row above it
            // otherwise it could still be reading from this level
            leader_level = level - 1;
            leader.wait_for_level(leader_level);
        }

        // Write this node and signal that it is done
        write_node(level, index, new_hash);
        follower.signal_level(level);
    }
}

} // namespace bb::crypto::merkle_tree